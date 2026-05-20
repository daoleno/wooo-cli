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
import {
  type Address,
  concat,
  encodeAbiParameters,
  getCreate2Address,
  type Hex,
  isAddress,
  keccak256,
  pad,
  toHex,
} from "viem";
import { resolveChainId } from "../../core/chain-ids";
import { loadWoooConfig, loadWoooConfigSync } from "../../core/config";
import { getActiveWalletPort } from "../../core/context";
import {
  getCredentialField,
  getCredentialService,
  requireCredentialField,
} from "../../core/credentials";
import type {
  ApprovalPrompt,
  EvmTypedDataField,
} from "../../core/signer-protocol";
import type { WalletPort } from "../../core/signers";

const DEFAULT_CLOB_HOST = "https://clob.polymarket.com";
const DEFAULT_DATA_HOST = "https://data-api.polymarket.com";
const DEFAULT_GAMMA_HOST = "https://gamma-api.polymarket.com";
const DEFAULT_BRIDGE_HOST = "https://bridge.polymarket.com";
const DEFAULT_RELAYER_HOST = "https://relayer-v2.polymarket.com";
const DEFAULT_HEADERS = {
  accept: "application/json",
  "user-agent": "wooo-cli/0.1.1",
} as const;

const POLYGON_CHAIN_ID = 137;
const DEPOSIT_WALLET_FACTORY =
  "0x00000000000Fb5C9ADea0298D729A0CB3823Cc07" as const;
const DEPOSIT_WALLET_IMPLEMENTATION =
  "0x58CA52ebe0DadfdF531Cde7062e76746de4Db1eB" as const;
const DEPOSIT_WALLET_DOMAIN_NAME = "DepositWallet";
const DEPOSIT_WALLET_DOMAIN_VERSION = "1";
const RELAYER_FINAL_STATES = new Set(["STATE_MINED", "STATE_CONFIRMED"]);
const RELAYER_FAILED_STATES = new Set(["STATE_FAILED", "STATE_INVALID"]);

const DEPOSIT_WALLET_TYPES = {
  Call: [
    { name: "target", type: "address" },
    { name: "value", type: "uint256" },
    { name: "data", type: "bytes" },
  ],
  Batch: [
    { name: "wallet", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "calls", type: "Call[]" },
  ],
} satisfies Record<string, EvmTypedDataField[]>;

export interface PolymarketAuthOptions {
  depositWalletAddress: Address;
}

export interface PolymarketAccountBindingInput {
  depositWalletAddress?: string;
  ownerAddress?: string;
}

export interface PolymarketAccountBinding {
  depositWalletAddress: Address;
  ownerAddress?: Address;
  signer: WalletPort;
  signerAddress: Address;
}

export interface PolymarketDepositWalletCall {
  data: Hex;
  target: Address;
  value: string;
}

export interface PolymarketRelayerTransaction {
  createdAt?: string;
  data?: string;
  from?: string;
  metadata?: string;
  nonce?: string;
  proxyAddress?: string;
  state: string;
  to?: string;
  transactionHash?: string;
  transactionID: string;
  type?: string;
  updatedAt?: string;
  value?: string;
}

export interface PolymarketRelayerSubmitResponse {
  hash?: string;
  state: string;
  transactionHash?: string;
  transactionID: string;
}

export interface PolymarketRelayerOptions {
  relayerUrl?: string;
}

export interface PolymarketBridgeOptions {
  bridgeHost?: string;
}

export interface PolymarketBridgeDepositAddressesResponse {
  address: Record<string, string>;
  note?: string;
}

export interface PolymarketBridgeSupportedAsset {
  chainId: string;
  chainName: string;
  minCheckoutUsd: number;
  token: {
    address: string;
    decimals: number;
    name: string;
    symbol: string;
  };
}

export interface PolymarketBridgeSupportedAssetsResponse {
  supportedAssets: PolymarketBridgeSupportedAsset[];
}

export interface PolymarketBridgeTransaction {
  createdTimeMs?: number;
  fromAmountBaseUnit?: string;
  fromChainId?: string;
  fromTokenAddress?: string;
  status: string;
  toChainId?: string;
  toTokenAddress?: string;
  txHash?: string;
}

export interface PolymarketBridgeStatusResponse {
  transactions: PolymarketBridgeTransaction[];
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

function normalizeBaseUrl(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function requireOptionalAddress(value: string | undefined, field: string) {
  if (!value) {
    return undefined;
  }
  return requireAddress(value, field);
}

function addressesEqual(a: Address, b: Address): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function combineOptionalAddresses(
  first: Address | undefined,
  firstLabel: string,
  second: Address | undefined,
  secondLabel: string,
): Address | undefined {
  if (first && second && !addressesEqual(first, second)) {
    throw new Error(
      `Polymarket address mismatch: ${firstLabel} ${first} does not match ${secondLabel} ${second}.`,
    );
  }
  return first ?? second;
}

async function readRelayerApiCreds() {
  const config = await loadWoooConfig();
  const credentials = getCredentialService("polymarket-relayer");
  const address = config.polymarket?.relayerApiKeyAddress;

  if (!address) {
    throw new Error(
      "Polymarket relayer auth is required. Run `wooo-cli auth set polymarket-relayer` and set config polymarket.relayerApiKeyAddress.",
    );
  }
  return {
    address: requireAddress(address, "config polymarket.relayerApiKeyAddress"),
    key: (
      await requireCredentialField({
        config,
        field: getCredentialField(credentials, "apiKey"),
        service: credentials,
      })
    ).reveal(),
  };
}

async function createRelayerAuthHeaders(): Promise<Record<string, string>> {
  const creds = await readRelayerApiCreds();
  return {
    RELAYER_API_KEY: creds.key,
    RELAYER_API_KEY_ADDRESS: creds.address,
  };
}

async function fetchRelayerJson<T>(
  baseUrl: string,
  path: string,
  options?: {
    body?: unknown;
    method?: "GET" | "POST";
    params?: Record<string, string | undefined>;
  },
): Promise<T> {
  const method = options?.method ?? "GET";
  const url = new URL(path, `${normalizeBaseUrl(baseUrl)}/`);
  if (options?.params) {
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined) {
        url.searchParams.set(key, value);
      }
    }
  }
  const body =
    options?.body === undefined ? undefined : JSON.stringify(options.body);
  const headers: Record<string, string> = {
    ...DEFAULT_HEADERS,
    ...(await createRelayerAuthHeaders()),
  };
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }

  const response = await fetch(url.toString(), {
    body,
    headers,
    method,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Polymarket relayer request failed with HTTP ${response.status}: ${text || "<empty>"}`,
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Polymarket relayer returned invalid JSON for ${path}: ${message}`,
    );
  }
}

async function fetchBridgeJson<T>(
  baseUrl: string,
  path: string,
  options?: {
    body?: unknown;
    method?: "GET" | "POST";
  },
): Promise<T> {
  const method = options?.method ?? "GET";
  const url = new URL(path, `${normalizeBaseUrl(baseUrl)}/`);
  const body =
    options?.body === undefined ? undefined : JSON.stringify(options.body);
  const headers: Record<string, string> = { ...DEFAULT_HEADERS };
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }

  const response = await fetch(url.toString(), {
    body,
    headers,
    method,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Polymarket bridge request failed with HTTP ${response.status}: ${text || "<empty>"}`,
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Polymarket bridge returned invalid JSON for ${path}: ${message}`,
    );
  }
}

function deriveDepositWalletAddress(owner: Address): Address {
  const walletId = pad(owner, { dir: "left", size: 32 });
  const args = encodeAbiParameters(
    [{ type: "address" }, { type: "bytes32" }],
    [DEPOSIT_WALLET_FACTORY, walletId],
  );
  const salt = keccak256(args);
  const bytecodeHash = initCodeHashERC1967(DEPOSIT_WALLET_IMPLEMENTATION, args);
  return getCreate2Address({
    bytecodeHash,
    from: DEPOSIT_WALLET_FACTORY,
    salt,
  });
}

const ERC1967_CONST1 =
  "0xcc3735a920a3ca505d382bbc545af43d6000803e6038573d6000fd5b3d6000f3";
const ERC1967_CONST2 =
  "0x5155f3363d3d373d3d363d7f360894a13ba1a3210667c828492db98dca3e2076";
const ERC1967_PREFIX = 0x61003d3d8160233d3973n;

function initCodeHashERC1967(implementation: Hex, args: Hex): Hex {
  const argBytes = BigInt((args.length - 2) / 2);
  const combined = ERC1967_PREFIX + (argBytes << 56n);
  return keccak256(
    concat([
      toHex(combined, { size: 10 }),
      implementation,
      "0x6009",
      ERC1967_CONST2,
      ERC1967_CONST1,
      args,
    ]),
  );
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
    async _signTypedData(domain, types, value) {
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

export function getPolymarketDepositWalletAddress(owner: Address): Address {
  return deriveDepositWalletAddress(owner);
}

export function resolvePolymarketAccountBindingFromSigner(
  signer: WalletPort,
  input: PolymarketAccountBindingInput = {},
): PolymarketAccountBinding {
  const config = loadWoooConfigSync();
  const signerAddress = requireAddress(signer.address, "active signer");
  const ownerFromInput = requireOptionalAddress(input.ownerAddress, "owner");
  const ownerFromConfig = requireOptionalAddress(
    config.polymarket?.owner,
    "config polymarket.owner",
  );
  const ownerAddress = combineOptionalAddresses(
    ownerFromInput,
    "owner",
    ownerFromConfig,
    "config polymarket.owner",
  );
  const depositWalletFromInput = requireOptionalAddress(
    input.depositWalletAddress,
    "deposit wallet",
  );
  const depositWalletFromConfig = requireOptionalAddress(
    config.polymarket?.depositWallet,
    "config polymarket.depositWallet",
  );
  const explicitDepositWallet = combineOptionalAddresses(
    depositWalletFromInput,
    "--deposit-wallet",
    depositWalletFromConfig,
    "config polymarket.depositWallet",
  );

  if (ownerAddress) {
    const derivedDepositWallet = deriveDepositWalletAddress(ownerAddress);
    if (
      explicitDepositWallet &&
      !addressesEqual(explicitDepositWallet, derivedDepositWallet)
    ) {
      throw new Error(
        `Polymarket deposit wallet mismatch: ${explicitDepositWallet} does not match the deterministic deposit wallet ${derivedDepositWallet} for owner ${ownerAddress}.`,
      );
    }
    return {
      depositWalletAddress: derivedDepositWallet,
      ownerAddress,
      signer,
      signerAddress,
    };
  }

  if (explicitDepositWallet) {
    return {
      depositWalletAddress: explicitDepositWallet,
      signer,
      signerAddress,
    };
  }

  return {
    depositWalletAddress: deriveDepositWalletAddress(signerAddress),
    ownerAddress: signerAddress,
    signer,
    signerAddress,
  };
}

export async function resolvePolymarketAccountBinding(
  input: PolymarketAccountBindingInput = {},
): Promise<PolymarketAccountBinding> {
  return resolvePolymarketAccountBindingFromSigner(
    await getActiveWalletPort("evm"),
    input,
  );
}

export function resolvePolymarketDeploymentOwner(
  binding: PolymarketAccountBinding,
): Address {
  if (binding.ownerAddress) {
    return binding.ownerAddress;
  }

  const signerDepositWallet = deriveDepositWalletAddress(binding.signerAddress);
  if (addressesEqual(signerDepositWallet, binding.depositWalletAddress)) {
    return binding.signerAddress;
  }

  throw new Error(
    "Polymarket owner is required for this operation. Set config polymarket.owner to the owner that derives the target deposit wallet.",
  );
}

export async function resolvePolymarketDepositWalletAddress(
  depositWalletAddress?: string,
): Promise<Address> {
  return (
    await resolvePolymarketAccountBinding({
      depositWalletAddress,
    })
  ).depositWalletAddress;
}

export async function resolvePolymarketAuthOptions(
  depositWalletAddress?: string,
): Promise<PolymarketAuthOptions> {
  return {
    depositWalletAddress:
      await resolvePolymarketDepositWalletAddress(depositWalletAddress),
  };
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

export class PolymarketBridgeClient {
  readonly bridgeHost: string;

  constructor(options?: PolymarketBridgeOptions) {
    this.bridgeHost = options?.bridgeHost ?? DEFAULT_BRIDGE_HOST;
  }

  async getSupportedAssets() {
    return await fetchBridgeJson<PolymarketBridgeSupportedAssetsResponse>(
      this.bridgeHost,
      "/supported-assets",
    );
  }

  async createDepositAddresses(address: Address) {
    return await fetchBridgeJson<PolymarketBridgeDepositAddressesResponse>(
      this.bridgeHost,
      "/deposit",
      {
        body: { address },
        method: "POST",
      },
    );
  }

  async getStatus(address: string) {
    const normalized = address.trim();
    if (!normalized) {
      throw new Error("Polymarket bridge deposit address is required.");
    }
    return await fetchBridgeJson<PolymarketBridgeStatusResponse>(
      this.bridgeHost,
      `/status/${encodeURIComponent(normalized)}`,
    );
  }
}

export class PolymarketRelayerClient {
  readonly relayerUrl: string;

  constructor(options?: PolymarketRelayerOptions) {
    this.relayerUrl = options?.relayerUrl ?? DEFAULT_RELAYER_HOST;
  }

  async getNonce(owner: Address, type: "WALLET" | "WALLET-CREATE") {
    return await fetchRelayerJson<{ nonce: string }>(
      this.relayerUrl,
      "/nonce",
      {
        params: { address: owner, type },
      },
    );
  }

  async getDeployed(address: Address, type = "WALLET") {
    const result = await fetchRelayerJson<{ deployed: boolean }>(
      this.relayerUrl,
      "/deployed",
      {
        params: { address, type },
      },
    );
    return result.deployed;
  }

  async getTransaction(transactionId: string) {
    return await fetchRelayerJson<PolymarketRelayerTransaction[]>(
      this.relayerUrl,
      "/transaction",
      {
        params: { id: transactionId },
      },
    );
  }

  async waitForTransaction(
    transactionId: string,
    options?: { intervalMs?: number; maxPolls?: number },
  ): Promise<PolymarketRelayerTransaction | undefined> {
    const intervalMs = options?.intervalMs ?? 2000;
    const maxPolls = options?.maxPolls ?? 100;
    for (let poll = 0; poll < maxPolls; poll++) {
      const [transaction] = await this.getTransaction(transactionId);
      if (transaction) {
        if (RELAYER_FINAL_STATES.has(transaction.state)) {
          return transaction;
        }
        if (RELAYER_FAILED_STATES.has(transaction.state)) {
          throw new Error(
            `Polymarket relayer transaction ${transactionId} failed with state ${transaction.state}.`,
          );
        }
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    return undefined;
  }

  async deployDepositWallet(owner: Address) {
    return await fetchRelayerJson<PolymarketRelayerSubmitResponse>(
      this.relayerUrl,
      "/submit",
      {
        body: {
          from: owner,
          to: DEPOSIT_WALLET_FACTORY,
          type: "WALLET-CREATE",
        },
        method: "POST",
      },
    );
  }

  async executeDepositWalletBatch(params: {
    calls: PolymarketDepositWalletCall[];
    deadline: string;
    signer: WalletPort;
    walletAddress: Address;
  }) {
    if (params.calls.length === 0) {
      throw new Error("At least one deposit wallet call is required.");
    }
    const signerAddress = requireAddress(params.signer.address, "signer");
    const { nonce } = await this.getNonce(signerAddress, "WALLET");
    const signature = await params.signer.signTypedData(
      resolveChainId("polygon"),
      {
        domain: {
          name: DEPOSIT_WALLET_DOMAIN_NAME,
          version: DEPOSIT_WALLET_DOMAIN_VERSION,
          chainId: POLYGON_CHAIN_ID,
          verifyingContract: params.walletAddress,
        },
        message: {
          calls: params.calls.map((call) => ({
            data: call.data,
            target: call.target,
            value: BigInt(call.value),
          })),
          deadline: BigInt(params.deadline),
          nonce: BigInt(nonce),
          wallet: params.walletAddress,
        },
        primaryType: "Batch",
        types: DEPOSIT_WALLET_TYPES,
      },
      {
        group: "prediction",
        protocol: "polymarket",
        command: "deposit-wallet-batch",
      },
      {
        action: "Authorize Polymarket deposit wallet batch",
        details: {
          calls: params.calls.length,
          deadline: params.deadline,
          wallet: params.walletAddress,
        },
      },
    );

    return await fetchRelayerJson<PolymarketRelayerSubmitResponse>(
      this.relayerUrl,
      "/submit",
      {
        body: {
          depositWalletParams: {
            calls: params.calls,
            deadline: params.deadline,
            depositWallet: params.walletAddress,
          },
          from: signerAddress,
          nonce,
          signature,
          to: DEPOSIT_WALLET_FACTORY,
          type: "WALLET",
        },
        method: "POST",
      },
    );
  }
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
      signatureType: SignatureTypeV2.POLY_1271,
      funderAddress: authOptions.depositWalletAddress,
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
      signatureType: SignatureTypeV2.POLY_1271,
      funderAddress: authOptions.depositWalletAddress,
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
