import {
  AssetType,
  Chain,
  ClobClient,
  getContractConfig,
  OrderType,
  Side,
  SignatureTypeV2,
  type TickSize,
} from "@polymarket/clob-client-v2";
import { type Address, isAddress } from "viem";
import { resolveChainId } from "../../core/chain-ids";
import { getActiveWallet, getActiveWalletPort } from "../../core/context";
import type {
  ApprovalPrompt,
  EvmTypedDataField,
} from "../../core/signer-protocol";
import type { WalletPort } from "../../core/signers";

const DEFAULT_CLOB_HOST = "https://clob.polymarket.com";
const DEFAULT_DATA_HOST = "https://data-api.polymarket.com";
const DEFAULT_GAMMA_HOST = "https://gamma-api.polymarket.com";
const DEFAULT_HEADERS = {
  accept: "application/json",
  "user-agent": "wooo-cli/0.1.1",
} as const;

export type PolymarketSignatureMode = "eoa" | "proxy" | "gnosis-safe";

export interface PolymarketAuthOptions {
  funderAddress?: string;
  signatureType: SignatureTypeV2;
}

export interface PolymarketListParams {
  limit?: number;
  offset?: number;
  ascending?: boolean;
  order?: string;
}

export interface PolymarketMarketListParams extends PolymarketListParams {
  active?: boolean;
  closed?: boolean;
}

export interface PolymarketEventListParams extends PolymarketListParams {
  active?: boolean;
  closed?: boolean;
  tag?: string;
}

export interface PolymarketSeriesListParams extends PolymarketListParams {
  closed?: boolean;
}

export interface PolymarketTeamListParams extends PolymarketListParams {
  league?: string;
}

export interface PolymarketAddressListParams {
  limit?: number;
  offset?: number;
}

export interface PolymarketContractConfig {
  exchange: Address;
  negRiskAdapter: Address;
  negRiskExchange: Address;
  collateral: Address;
  conditionalTokens: Address;
}

interface PolymarketClobSigner {
  _signTypedData(
    domain: Record<string, unknown>,
    types: Record<string, EvmTypedDataField[]>,
    value: Record<string, unknown>,
  ): Promise<string>;
  getAddress(): Promise<string>;
}

function cleanParams(
  params: Record<string, boolean | number | string | undefined>,
): URLSearchParams {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") {
      continue;
    }
    searchParams.set(key, String(value));
  }
  return searchParams;
}

async function fetchJson<T>(
  baseUrl: string,
  path: string,
  params?: Record<string, boolean | number | string | undefined>,
): Promise<T> {
  const url = new URL(path, `${baseUrl}/`);
  if (params) {
    url.search = cleanParams(params).toString();
  }

  const response = await fetch(url.toString(), {
    headers: DEFAULT_HEADERS,
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `Polymarket request failed with HTTP ${response.status}: ${body || "<empty>"}`,
    );
  }

  try {
    return JSON.parse(body) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Polymarket endpoint returned invalid JSON for ${path}: ${message}`,
    );
  }
}

function isNumericId(value: string): boolean {
  return /^\d+$/.test(value.trim());
}

function requireAddress(value: string, field: string): Address {
  if (!isAddress(value)) {
    throw new Error(
      `Polymarket returned an invalid ${field} address: ${value}`,
    );
  }
  return value;
}

function inferPolymarketPrompt(
  primaryType: string,
  domain: Record<string, unknown>,
  message: Record<string, unknown>,
): ApprovalPrompt {
  const domainName =
    typeof domain.name === "string" ? domain.name : "unknown-domain";

  if (primaryType === "ClobAuth") {
    return {
      action: "Authorize Polymarket CLOB authentication",
      details: {
        domain: domainName,
        primaryType,
        nonce:
          typeof message.nonce === "number" || typeof message.nonce === "string"
            ? String(message.nonce)
            : null,
      },
    };
  }

  return {
    action: "Authorize Polymarket order signature",
    details: {
      domain: domainName,
      primaryType,
      tokenId: typeof message.tokenId === "string" ? message.tokenId : null,
      maker: typeof message.maker === "string" ? message.maker : null,
      signer: typeof message.signer === "string" ? message.signer : null,
      side: typeof message.side === "number" ? message.side : null,
    },
  };
}

function inferTypedDataPrimaryType(
  types: Record<string, EvmTypedDataField[]>,
): string {
  const primaryType = Object.keys(types).find((key) => key !== "EIP712Domain");
  if (!primaryType) {
    throw new Error("Polymarket typed data is missing a primary type.");
  }
  return primaryType;
}

function createClobSignerAdapter(signer: WalletPort): PolymarketClobSigner {
  return {
    async _signTypedData(
      domain,
      types,
      value,
    ) {
      const primaryType = inferTypedDataPrimaryType(types);
      return await signer.signTypedData(
        resolveChainId("polygon"),
        {
          domain,
          types,
          primaryType,
          message: value,
        },
        {
          group: "prediction",
          protocol: "polymarket",
          command: primaryType === "ClobAuth" ? "auth" : "order",
        },
        inferPolymarketPrompt(primaryType, domain, value),
      );
    },
    async getAddress() {
      return signer.address;
    },
  };
}

export function parsePolymarketSignatureType(
  value: string | undefined,
): SignatureTypeV2 {
  const normalized = (value ?? "eoa").trim().toLowerCase();
  switch (normalized) {
    case "eoa":
      return SignatureTypeV2.EOA;
    case "proxy":
      return SignatureTypeV2.POLY_PROXY;
    case "gnosis-safe":
      return SignatureTypeV2.POLY_GNOSIS_SAFE;
    default:
      throw new Error(
        `Unsupported Polymarket signature type: ${value}. Use eoa, proxy, or gnosis-safe.`,
      );
  }
}

export function resolvePolymarketAuthOptions(
  signatureType: string | undefined,
  funderAddress: string | undefined,
): PolymarketAuthOptions {
  const resolvedType = parsePolymarketSignatureType(signatureType);
  if (resolvedType !== SignatureTypeV2.EOA && !funderAddress) {
    throw new Error(
      "Polymarket proxy and gnosis-safe modes require --funder-address.",
    );
  }

  return {
    signatureType: resolvedType,
    funderAddress,
  };
}

export async function resolvePolymarketAddress(
  address?: string,
): Promise<string> {
  if (address) {
    return address;
  }

  const wallet = await getActiveWallet("evm");
  return wallet.address;
}

export function getPolymarketContractConfig() {
  const config = getContractConfig(Chain.POLYGON);
  return {
    exchange: requireAddress(config.exchangeV2, "exchange"),
    negRiskAdapter: requireAddress(config.negRiskAdapter, "negRiskAdapter"),
    negRiskExchange: requireAddress(
      config.negRiskExchangeV2,
      "negRiskExchange",
    ),
    collateral: requireAddress(config.collateral, "collateral"),
    conditionalTokens: requireAddress(
      config.conditionalTokens,
      "conditionalTokens",
    ),
  } satisfies PolymarketContractConfig;
}

export class PolymarketClient {
  readonly clobHost: string;
  readonly dataHost: string;
  readonly gammaHost: string;

  constructor(options?: {
    clobHost?: string;
    dataHost?: string;
    gammaHost?: string;
  }) {
    this.clobHost =
      options?.clobHost ??
      process.env.WOOO_POLYMARKET_CLOB_URL ??
      DEFAULT_CLOB_HOST;
    this.dataHost =
      options?.dataHost ??
      process.env.WOOO_POLYMARKET_DATA_URL ??
      DEFAULT_DATA_HOST;
    this.gammaHost =
      options?.gammaHost ??
      process.env.WOOO_POLYMARKET_GAMMA_URL ??
      DEFAULT_GAMMA_HOST;
  }

  createPublicClobClient(): ClobClient {
    return new ClobClient({
      host: this.clobHost,
      chain: Chain.POLYGON,
      useServerTime: true,
      retryOnError: true,
      throwOnError: true,
    });
  }

  async createAuthenticatedClobClient(
    authOptions: PolymarketAuthOptions,
  ): Promise<ClobClient> {
    const signer = await getActiveWalletPort("evm");
    const clobSigner = createClobSignerAdapter(signer);
    const initialClient = new ClobClient({
      host: this.clobHost,
      chain: Chain.POLYGON,
      signer: clobSigner,
      signatureType: authOptions.signatureType,
      funderAddress: authOptions.funderAddress,
      useServerTime: true,
      retryOnError: true,
      throwOnError: true,
    });
    const creds = await initialClient.createOrDeriveApiKey();

    return new ClobClient({
      host: this.clobHost,
      chain: Chain.POLYGON,
      signer: clobSigner,
      creds,
      signatureType: authOptions.signatureType,
      funderAddress: authOptions.funderAddress,
      useServerTime: true,
      retryOnError: true,
      throwOnError: true,
    });
  }

  async listMarkets(params: PolymarketMarketListParams = {}) {
    return await fetchJson<unknown[]>(this.gammaHost, "/markets", {
      limit: params.limit,
      offset: params.offset,
      order: params.order,
      ascending: params.ascending,
      closed:
        params.closed ??
        (params.active !== undefined ? !params.active : undefined),
    });
  }

  async getMarket(idOrSlug: string) {
    return await fetchJson<unknown>(
      this.gammaHost,
      isNumericId(idOrSlug)
        ? `/markets/${idOrSlug.trim()}`
        : `/markets/slug/${idOrSlug.trim()}`,
    );
  }

  async getMarketTags(id: string) {
    return await fetchJson<unknown[]>(
      this.gammaHost,
      `/markets/${id.trim()}/tags`,
    );
  }

  async listEvents(params: PolymarketEventListParams = {}) {
    return await fetchJson<unknown[]>(this.gammaHost, "/events", {
      limit: params.limit,
      offset: params.offset,
      order: params.order,
      ascending: params.ascending,
      tag_slug: params.tag,
      closed:
        params.closed ??
        (params.active !== undefined ? !params.active : undefined),
    });
  }

  async getEvent(idOrSlug: string) {
    return await fetchJson<unknown>(
      this.gammaHost,
      isNumericId(idOrSlug)
        ? `/events/${idOrSlug.trim()}`
        : `/events/slug/${idOrSlug.trim()}`,
    );
  }

  async getEventTags(id: string) {
    return await fetchJson<unknown[]>(
      this.gammaHost,
      `/events/${id.trim()}/tags`,
    );
  }

  async listTags(params: PolymarketListParams = {}) {
    return await fetchJson<unknown[]>(this.gammaHost, "/tags", {
      limit: params.limit,
      offset: params.offset,
      ascending: params.ascending,
    });
  }

  async getTag(idOrSlug: string) {
    return await fetchJson<unknown>(
      this.gammaHost,
      isNumericId(idOrSlug)
        ? `/tags/${idOrSlug.trim()}`
        : `/tags/slug/${idOrSlug.trim()}`,
    );
  }

  async getRelatedTagLinks(id: string, omitEmpty?: boolean) {
    return await fetchJson<unknown[]>(
      this.gammaHost,
      `/tags/${id.trim()}/related-tags`,
      {
        omitEmpty,
      },
    );
  }

  async getRelatedTags(id: string, omitEmpty?: boolean) {
    const relations = await this.getRelatedTagLinks(id, omitEmpty);
    const tagIds = relations
      .map((item) => {
        if (
          item &&
          typeof item === "object" &&
          "relatedTagID" in item &&
          typeof item.relatedTagID === "number"
        ) {
          return String(item.relatedTagID);
        }
        return null;
      })
      .filter((value): value is string => Boolean(value));

    return await Promise.all(tagIds.map((tagId) => this.getTag(tagId)));
  }

  async listSeries(params: PolymarketSeriesListParams = {}) {
    return await fetchJson<unknown[]>(this.gammaHost, "/series", {
      limit: params.limit,
      offset: params.offset,
      order: params.order,
      ascending: params.ascending,
      closed: params.closed,
    });
  }

  async getSeries(id: string) {
    return await fetchJson<unknown>(this.gammaHost, `/series/${id.trim()}`);
  }

  async listSports() {
    return await fetchJson<unknown[]>(this.gammaHost, "/sports");
  }

  async listSportMarketTypes() {
    return await fetchJson<{ marketTypes: string[] }>(
      this.gammaHost,
      "/sports/market-types",
    );
  }

  async listTeams(params: PolymarketTeamListParams = {}) {
    return await fetchJson<unknown[]>(this.gammaHost, "/teams", {
      limit: params.limit,
      offset: params.offset,
      order: params.order,
      ascending: params.ascending,
      league: params.league,
    });
  }

  async getPositions(
    address: string,
    params: PolymarketAddressListParams = {},
  ) {
    return await fetchJson<unknown[]>(this.dataHost, "/positions", {
      user: address,
      limit: params.limit,
      offset: params.offset,
    });
  }

  async getClosedPositions(
    address: string,
    params: PolymarketAddressListParams = {},
  ) {
    return await fetchJson<unknown[]>(this.dataHost, "/closed-positions", {
      user: address,
      limit: params.limit,
      offset: params.offset,
    });
  }

  async getValue(address: string) {
    return await fetchJson<unknown[]>(this.dataHost, "/value", {
      user: address,
    });
  }

  async getTraded(address: string) {
    return await fetchJson<unknown>(this.dataHost, "/traded", {
      user: address,
    });
  }

  async getTrades(address: string, params: PolymarketAddressListParams = {}) {
    return await fetchJson<unknown[]>(this.dataHost, "/trades", {
      user: address,
      limit: params.limit,
      offset: params.offset,
    });
  }

  async getActivity(address: string, params: PolymarketAddressListParams = {}) {
    return await fetchJson<unknown[]>(this.dataHost, "/activity", {
      user: address,
      limit: params.limit,
      offset: params.offset,
    });
  }

  async getLiveVolume(id: string) {
    return await fetchJson<unknown[]>(this.dataHost, "/live-volume", {
      id,
    });
  }
}

export {
  AssetType,
  Chain,
  OrderType,
  Side,
  SignatureTypeV2 as SignatureType,
  type TickSize,
};
