import { createHmac } from "node:crypto";
import { normalizeChainName } from "../../core/chain-ids";
import { loadWoooConfig } from "../../core/config";

const DEFAULT_OKX_ONCHAIN_BASE_URL = "https://web3.okx.com";
const DEFAULT_HEADERS = {
  accept: "application/json",
  "content-type": "application/json",
  "user-agent": "wooo-cli/0.1.0",
} as const;

const OKX_ONCHAIN_CHAIN_INDEX_BY_NAME = {
  aptos: "637",
  arbitrum: "42161",
  avalanche: "43114",
  avax: "43114",
  base: "8453",
  bnb: "56",
  bsc: "56",
  ethereum: "1",
  linea: "59144",
  mantle: "5000",
  optimism: "10",
  polygon: "137",
  scroll: "534352",
  solana: "501",
  tron: "195",
  zksync: "324",
} as const satisfies Record<string, string>;

const OKX_ONCHAIN_CHAIN_NAME_BY_INDEX: Record<string, string> = {
  "1": "ethereum",
  "10": "optimism",
  "56": "bsc",
  "137": "polygon",
  "195": "tron",
  "324": "zksync",
  "501": "solana",
  "637": "aptos",
  "5000": "mantle",
  "8453": "base",
  "42161": "arbitrum",
  "43114": "avalanche",
  "534352": "scroll",
  "59144": "linea",
};

type OkxOnchainMethod = "GET" | "POST";
type OkxOnchainPayload =
  | Array<Record<string, unknown>>
  | Record<string, unknown>;
type OkxOnchainQueryValue = boolean | number | string | undefined;
type OkxOnchainQuery = Record<string, OkxOnchainQueryValue>;

interface OkxOnchainEnvelope<T> {
  code: number | string;
  data: T;
  msg?: string;
}

export interface OkxOnchainCredentials {
  apiKey: string;
  secret: string;
  passphrase: string;
}

export interface OkxOnchainClientOptions extends OkxOnchainCredentials {
  baseUrl?: string;
  clock?: () => string;
  fetchImpl?: typeof fetch;
}

export interface OkxOnchainChainRecord {
  chainIndex: string;
  logoUrl?: string;
  name?: string;
  shortName?: string;
}

interface OkxOnchainPortfolioSupportedChainRecord {
  chainIndex: string;
  chainLogo?: string;
  chainName?: string;
}

export interface OkxOnchainTokenTagList {
  communityRecognized?: boolean;
}

export interface OkxOnchainTokenSearchResult {
  chainIndex: string;
  change?: string;
  decimal?: string;
  explorerUrl?: string;
  holders?: string;
  liquidity?: string;
  marketCap?: string;
  price?: string;
  tagList?: OkxOnchainTokenTagList;
  tokenContractAddress: string;
  tokenLogoUrl?: string;
  tokenName?: string;
  tokenSymbol?: string;
}

export interface OkxOnchainTokenInfo {
  chainIndex: string;
  decimal?: string;
  tagList?: OkxOnchainTokenTagList;
  tokenContractAddress: string;
  tokenLogoUrl?: string;
  tokenName?: string;
  tokenSymbol?: string;
}

export interface OkxOnchainTokenPriceInfo {
  chainIndex: string;
  circSupply?: string;
  holders?: string;
  liquidity?: string;
  marketCap?: string;
  maxPrice?: string;
  minPrice?: string;
  price?: string;
  priceChange1H?: string;
  priceChange24H?: string;
  priceChange4H?: string;
  priceChange5M?: string;
  time?: string;
  tokenContractAddress: string;
  tradeNum?: string;
  txs1H?: string;
  txs24H?: string;
  txs4H?: string;
  txs5M?: string;
  volume1H?: string;
  volume24H?: string;
  volume4H?: string;
  volume5M?: string;
}

export interface OkxOnchainTradeTokenInfo {
  amount?: string;
  tokenContractAddress?: string;
  tokenSymbol?: string;
}

export interface OkxOnchainTrade {
  chainIndex: string;
  changedTokenInfo?: OkxOnchainTradeTokenInfo[];
  dexName?: string;
  id: string;
  isFiltered?: string;
  poolLogoUrl?: string;
  price?: string;
  time?: string;
  tokenContractAddress: string;
  txHashUrl?: string;
  type?: string;
  userAddress?: string;
  volume?: string;
}

export interface OkxOnchainHistoricalCandle {
  close: string;
  confirm?: string;
  high: string;
  low: string;
  open: string;
  timestamp: string;
  volume: string;
  volumeUsd: string;
}

export interface OkxOnchainTokenHolder {
  avgBuyPrice?: string;
  avgSellPrice?: string;
  boughtAmount?: string;
  fundingSource?: string;
  holdAmount?: string;
  holdPercent?: string;
  holderWalletAddress?: string;
  nativeTokenBalance?: string;
  realizedPnlUsd?: string;
  totalPnlUsd?: string;
  totalSellAmount?: string;
  unrealizedPnlUsd?: string;
}

export interface OkxOnchainTokenRankingEntry {
  chainIndex: string;
  change?: string;
  firstTradeTime?: string;
  holders?: string;
  liquidity?: string;
  marketCap?: string;
  price?: string;
  tokenContractAddress: string;
  tokenLogoUrl?: string;
  tokenSymbol?: string;
  txs?: string;
  txsBuy?: string;
  txsSell?: string;
  uniqueTraders?: string;
  volume?: string;
}

export interface OkxOnchainPortfolioOverviewTopToken {
  tokenContractAddress?: string;
  tokenPnLPercent?: string;
  tokenPnLUsd?: string;
  tokenSymbol?: string;
}

export interface OkxOnchainPortfolioOverviewPnlBuckets {
  over500Percent?: string;
  overMinus50Percent?: string;
  zeroTo500Percent?: string;
  zeroToMinus50Percent?: string;
}

export interface OkxOnchainPortfolioOverviewBuyMarketCapStat {
  buyCount?: string;
  marketCapRange?: string;
}

export interface OkxOnchainPortfolioOverview {
  avgBuyValueUsd?: string;
  buyTxCount?: string;
  buyTxVolume?: string;
  buysByMarketCap?: OkxOnchainPortfolioOverviewBuyMarketCapStat[];
  preferredMarketCap?: string;
  realizedPnlUsd?: string;
  sellTxCount?: string;
  sellTxVolume?: string;
  tokenCountByPnlPercent?: OkxOnchainPortfolioOverviewPnlBuckets;
  top3PnlTokenPercent?: string;
  top3PnlTokenSumUsd?: string;
  topPnlTokenList?: OkxOnchainPortfolioOverviewTopToken[];
  winRate?: string;
}

export interface OkxOnchainPortfolioRecentPnlDuration {
  holdingTimestamp?: string;
  sellOffTimestamp?: string;
}

export interface OkxOnchainPortfolioRecentPnlEntry {
  buyAvgPrice?: string;
  buyTxCount?: string;
  buyTxVolume?: string;
  chainIndex: string;
  lastActiveTimestamp?: string;
  realizedPnlPercent?: string;
  realizedPnlUsd?: string;
  sellAvgPrice?: string;
  sellTxCount?: string;
  sellTxVolume?: string;
  tokenBalanceAmount?: string;
  tokenBalanceUsd?: string;
  tokenContractAddress: string;
  tokenPositionDuration?: OkxOnchainPortfolioRecentPnlDuration;
  tokenPositionPercent?: string;
  tokenSymbol?: string;
  totalPnlPercent?: string;
  totalPnlUsd?: string;
  unrealizedPnlPercent?: string;
  unrealizedPnlUsd?: string;
}

export interface OkxOnchainPortfolioRecentPnlPage {
  cursor?: string;
  pnlList?: OkxOnchainPortfolioRecentPnlEntry[];
}

export interface OkxOnchainPortfolioLatestPnl {
  isPnlSupported?: boolean;
  realizedPnlPercent?: string;
  realizedPnlUsd?: string;
  totalPnlPercent?: string;
  totalPnlUsd?: string;
  unrealizedPnlPercent?: string;
  unrealizedPnlUsd?: string;
}

export interface OkxOnchainPortfolioDexHistoryEntry {
  amount?: string;
  chainIndex: string;
  marketCap?: string;
  pnlUsd?: string;
  price?: string;
  time?: string;
  tokenContractAddress: string;
  tokenSymbol?: string;
  type?: string;
  valueUsd?: string;
}

export interface OkxOnchainPortfolioDexHistoryPage {
  cursor?: string;
  transactionList?: OkxOnchainPortfolioDexHistoryEntry[];
}

export interface OkxOnchainBalanceAsset {
  address?: string;
  balance?: string;
  chainIndex: string;
  isRiskToken?: boolean;
  rawBalance?: string;
  symbol?: string;
  tokenContractAddress?: string;
  tokenPrice?: string;
}

export interface OkxOnchainBalancePayload {
  tokenAssets?: OkxOnchainBalanceAsset[];
}

export interface OkxOnchainTotalValueRecord {
  totalValue?: string;
}

export interface OkxOnchainTransferParty {
  address?: string;
  amount?: string;
}

export interface OkxOnchainTransactionHistoryItem {
  amount?: string;
  chainIndex: string;
  from?: OkxOnchainTransferParty[];
  hitBlacklist?: boolean;
  itype?: string;
  methodId?: string;
  nonce?: string;
  symbol?: string;
  tag?: string;
  to?: OkxOnchainTransferParty[];
  tokenContractAddress?: string;
  txFee?: string;
  txHash?: string;
  txStatus?: string;
  txTime?: string;
}

export interface OkxOnchainTransactionHistoryPage {
  cursor?: string;
  transactionList?: OkxOnchainTransactionHistoryItem[];
  transactions?: OkxOnchainTransactionHistoryItem[];
}

export interface OkxOnchainTransactionDetailParty {
  address?: string;
  amount?: string;
  isContract?: boolean;
  preVoutIndex?: string;
  txHash?: string;
  vinIndex?: string;
  voutIndex?: string;
}

export interface OkxOnchainTransactionDetailInternalTransfer {
  amount?: string;
  from?: string;
  isFromContract?: boolean;
  isToContract?: boolean;
  state?: string;
  to?: string;
}

export interface OkxOnchainTransactionDetailTokenTransfer {
  amount?: string;
  from?: string;
  isFromContract?: boolean;
  isToContract?: boolean;
  symbol?: string;
  to?: string;
  tokenContractAddress?: string;
}

export interface OkxOnchainTransactionDetail {
  amount?: string;
  chainIndex: string;
  fromDetails?: OkxOnchainTransactionDetailParty[];
  gasLimit?: string;
  gasPrice?: string;
  gasUsed?: string;
  height?: string;
  internalTransactionDetails?: OkxOnchainTransactionDetailInternalTransfer[];
  l1OriginHash?: string;
  methodId?: string;
  nonce?: string;
  symbol?: string;
  toDetails?: OkxOnchainTransactionDetailParty[];
  tokenTransferDetails?: OkxOnchainTransactionDetailTokenTransfer[];
  txFee?: string;
  txStatus?: string;
  txTime?: string;
  txhash?: string;
}

function sanitizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeOkxOnchainRequestTokenAddress(value: string): string {
  if (/^0x[0-9a-fA-F]{40}$/.test(value)) {
    return value.toLowerCase();
  }
  return value;
}

function encodeQuery(query?: OkxOnchainQuery): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === "") {
      continue;
    }
    params.set(key, String(value));
  }
  return params;
}

function buildRequestPath(path: string, query?: OkxOnchainQuery): string {
  const searchParams = encodeQuery(query).toString();
  return searchParams ? `${path}?${searchParams}` : path;
}

export function describeOkxOnchainChainIndex(chainIndex: string): string {
  return OKX_ONCHAIN_CHAIN_NAME_BY_INDEX[chainIndex] ?? `chain:${chainIndex}`;
}

export function resolveOkxOnchainChainIndex(chain: string): string {
  const raw = chain.trim();
  if (!raw) {
    throw new Error("OKX Onchain chain cannot be empty.");
  }

  if (/^\d+$/.test(raw)) {
    return raw;
  }

  const normalized = normalizeChainName(raw);
  const chainIndex =
    OKX_ONCHAIN_CHAIN_INDEX_BY_NAME[
      normalized as keyof typeof OKX_ONCHAIN_CHAIN_INDEX_BY_NAME
    ];

  if (!chainIndex) {
    throw new Error(
      `Unsupported OKX Onchain chain: ${chain}. Use a chain name like ethereum, base, solana or a numeric chainIndex.`,
    );
  }

  return chainIndex;
}

export function resolveOkxOnchainChainSelection(chains: string): {
  chainIndexes: string[];
  query: string;
} {
  const chainIndexes = Array.from(
    new Set(
      chains
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .map(resolveOkxOnchainChainIndex),
    ),
  );

  if (chainIndexes.length === 0) {
    throw new Error(
      "OKX Onchain chain selection cannot be empty. Pass a comma-separated list like ethereum,base or 1,8453.",
    );
  }

  return {
    chainIndexes,
    query: chainIndexes.join(","),
  };
}

export function normalizeOkxOnchainTokenAddress(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error("Token address cannot be empty.");
  }
  if (normalized.toLowerCase() === "native") {
    return "";
  }
  return normalizeOkxOnchainRequestTokenAddress(normalized);
}

export function createOkxOnchainSignature(
  timestamp: string,
  method: OkxOnchainMethod,
  requestPath: string,
  secret: string,
  body = "",
): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}${method}${requestPath}${body}`)
    .digest("base64");
}

export async function resolveOkxOnchainClientOptionsFromConfig(): Promise<OkxOnchainClientOptions> {
  const config = await loadWoooConfig();
  const section = config.okxOnchain;

  const apiKey =
    process.env.WOOO_OKX_ONCHAIN_API_KEY || section?.apiKey || undefined;
  const secret =
    process.env.WOOO_OKX_ONCHAIN_SECRET || section?.secret || undefined;
  const passphrase =
    process.env.WOOO_OKX_ONCHAIN_PASSPHRASE || section?.passphrase || undefined;
  const baseUrl =
    process.env.WOOO_OKX_ONCHAIN_BASE_URL ||
    section?.baseUrl ||
    DEFAULT_OKX_ONCHAIN_BASE_URL;

  if (!apiKey || !secret || !passphrase) {
    console.error("Error: OKX Onchain API credentials are not configured.");
    console.error(
      "Set WOOO_OKX_ONCHAIN_API_KEY, WOOO_OKX_ONCHAIN_SECRET, and WOOO_OKX_ONCHAIN_PASSPHRASE, or run:",
    );
    console.error("  wooo-cli config set okxOnchain.apiKey <key>");
    console.error("  wooo-cli config set okxOnchain.secret <secret>");
    console.error("  wooo-cli config set okxOnchain.passphrase <passphrase>");
    process.exit(3);
  }

  return {
    apiKey,
    secret,
    passphrase,
    baseUrl,
  };
}

export async function createOkxOnchainClientFromConfig(): Promise<OkxOnchainClient> {
  return new OkxOnchainClient(await resolveOkxOnchainClientOptionsFromConfig());
}

export class OkxOnchainClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly clock: () => string;
  private readonly fetchImpl: typeof fetch;
  private readonly passphrase: string;
  private readonly secret: string;

  constructor(options: OkxOnchainClientOptions) {
    this.apiKey = options.apiKey;
    this.secret = options.secret;
    this.passphrase = options.passphrase;
    this.baseUrl = options.baseUrl || DEFAULT_OKX_ONCHAIN_BASE_URL;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.clock = options.clock ?? (() => new Date().toISOString());
  }

  async listSupportedChains(): Promise<OkxOnchainChainRecord[]> {
    return await this.request<OkxOnchainChainRecord[]>(
      "GET",
      "/api/v6/dex/balance/supported/chain",
    );
  }

  async listPortfolioSupportedChains(): Promise<OkxOnchainChainRecord[]> {
    const chains = await this.request<
      OkxOnchainPortfolioSupportedChainRecord[]
    >("GET", "/api/v6/dex/market/portfolio/supported/chain");

    return chains.map((chain) => ({
      chainIndex: chain.chainIndex,
      logoUrl: chain.chainLogo,
      name: chain.chainName,
    }));
  }

  async searchTokens(params: {
    chains: string;
    search: string;
  }): Promise<OkxOnchainTokenSearchResult[]> {
    return await this.request<OkxOnchainTokenSearchResult[]>(
      "GET",
      "/api/v6/dex/market/token/search",
      params,
    );
  }

  async getTokenInfo(params: {
    chainIndex: string;
    tokenContractAddress: string;
  }): Promise<OkxOnchainTokenInfo | null> {
    const result = await this.request<OkxOnchainTokenInfo[]>(
      "POST",
      "/api/v6/dex/market/token/basic-info",
      undefined,
      [
        {
          ...params,
          tokenContractAddress: normalizeOkxOnchainRequestTokenAddress(
            params.tokenContractAddress,
          ),
        },
      ],
    );
    return result[0] ?? null;
  }

  async getTokenPriceInfo(params: {
    chainIndex: string;
    tokenContractAddress: string;
  }): Promise<OkxOnchainTokenPriceInfo | null> {
    const result = await this.request<OkxOnchainTokenPriceInfo[]>(
      "POST",
      "/api/v6/dex/market/price-info",
      undefined,
      [
        {
          ...params,
          tokenContractAddress: normalizeOkxOnchainRequestTokenAddress(
            params.tokenContractAddress,
          ),
        },
      ],
    );
    return result[0] ?? null;
  }

  async getTrades(params: {
    after?: string;
    chainIndex: string;
    limit?: string;
    tagFilter?: string;
    tokenContractAddress: string;
    walletAddressFilter?: string;
  }): Promise<OkxOnchainTrade[]> {
    return await this.request<OkxOnchainTrade[]>(
      "GET",
      "/api/v6/dex/market/trades",
      {
        ...params,
        tokenContractAddress: normalizeOkxOnchainRequestTokenAddress(
          params.tokenContractAddress,
        ),
      },
    );
  }

  async getHistoricalCandles(params: {
    after?: string;
    bar?: string;
    before?: string;
    chainIndex: string;
    limit?: string;
    tokenContractAddress: string;
  }): Promise<OkxOnchainHistoricalCandle[]> {
    const result = await this.request<string[][]>(
      "GET",
      "/api/v6/dex/market/historical-candles",
      {
        ...params,
        tokenContractAddress: normalizeOkxOnchainRequestTokenAddress(
          params.tokenContractAddress,
        ),
      },
    );

    return result.map((row) => ({
      timestamp: row[0] ?? "",
      open: row[1] ?? "",
      high: row[2] ?? "",
      low: row[3] ?? "",
      close: row[4] ?? "",
      volume: row[5] ?? "",
      volumeUsd: row[6] ?? "",
      confirm: row[7],
    }));
  }

  async getTokenHolders(params: {
    chainIndex: string;
    tagFilter?: string;
    tokenContractAddress: string;
  }): Promise<OkxOnchainTokenHolder[]> {
    return await this.request<OkxOnchainTokenHolder[]>(
      "GET",
      "/api/v6/dex/market/token/holder",
      {
        ...params,
        tokenContractAddress: normalizeOkxOnchainRequestTokenAddress(
          params.tokenContractAddress,
        ),
      },
    );
  }

  async getTokenRanking(params: {
    chains: string;
    sortBy: string;
    timeFrame: string;
  }): Promise<OkxOnchainTokenRankingEntry[]> {
    return await this.request<OkxOnchainTokenRankingEntry[]>(
      "GET",
      "/api/v6/dex/market/token/toplist",
      params,
    );
  }

  async getPortfolioOverview(params: {
    chainIndex: string;
    timeFrame: string;
    walletAddress: string;
  }): Promise<OkxOnchainPortfolioOverview | null> {
    return await this.request<OkxOnchainPortfolioOverview | null>(
      "GET",
      "/api/v6/dex/market/portfolio/overview",
      params,
    );
  }

  async getPortfolioRecentPnl(params: {
    chainIndex: string;
    cursor?: string;
    limit?: string;
    walletAddress: string;
  }): Promise<OkxOnchainPortfolioRecentPnlPage> {
    return await this.request<OkxOnchainPortfolioRecentPnlPage>(
      "GET",
      "/api/v6/dex/market/portfolio/recent-pnl",
      params,
    );
  }

  async getPortfolioLatestPnl(params: {
    chainIndex: string;
    tokenContractAddress: string;
    walletAddress: string;
  }): Promise<OkxOnchainPortfolioLatestPnl | null> {
    return await this.request<OkxOnchainPortfolioLatestPnl | null>(
      "GET",
      "/api/v6/dex/market/portfolio/token/latest-pnl",
      {
        ...params,
        tokenContractAddress: normalizeOkxOnchainRequestTokenAddress(
          params.tokenContractAddress,
        ),
      },
    );
  }

  async getPortfolioDexHistory(params: {
    begin: string;
    chainIndex: string;
    cursor?: string;
    end: string;
    limit?: string;
    tokenContractAddress?: string;
    type?: string;
    walletAddress: string;
  }): Promise<OkxOnchainPortfolioDexHistoryPage> {
    return await this.request<OkxOnchainPortfolioDexHistoryPage>(
      "GET",
      "/api/v6/dex/market/portfolio/dex-history",
      {
        ...params,
        tokenContractAddress: params.tokenContractAddress
          ? normalizeOkxOnchainRequestTokenAddress(params.tokenContractAddress)
          : undefined,
      },
    );
  }

  async getTotalValue(params: {
    address: string;
    assetType?: "0" | "1" | "2";
    chains: string;
    excludeRiskToken?: boolean;
  }): Promise<OkxOnchainTotalValueRecord | null> {
    const result = await this.request<OkxOnchainTotalValueRecord[]>(
      "GET",
      "/api/v6/dex/balance/total-value-by-address",
      {
        address: params.address,
        assetType: params.assetType,
        chains: params.chains,
        excludeRiskToken: params.excludeRiskToken,
      },
    );
    return result[0] ?? null;
  }

  async getTokenBalances(params: {
    address: string;
    chains: string;
    includeRisk?: boolean;
  }): Promise<OkxOnchainBalanceAsset[]> {
    const result = await this.request<OkxOnchainBalancePayload[]>(
      "GET",
      "/api/v6/dex/balance/all-token-balances-by-address",
      {
        address: params.address,
        chains: params.chains,
        excludeRiskToken: params.includeRisk ? "1" : undefined,
      },
    );
    return result[0]?.tokenAssets ?? [];
  }

  async getSpecificTokenBalances(params: {
    address: string;
    includeRisk?: boolean;
    tokens: Array<{ chainIndex: string; tokenContractAddress: string }>;
  }): Promise<OkxOnchainBalanceAsset[]> {
    const result = await this.request<OkxOnchainBalancePayload[]>(
      "POST",
      "/api/v6/dex/balance/token-balances-by-address",
      undefined,
      {
        address: params.address,
        excludeRiskToken: params.includeRisk ? "1" : undefined,
        tokenContractAddresses: params.tokens.map((token) => ({
          ...token,
          tokenContractAddress: normalizeOkxOnchainRequestTokenAddress(
            token.tokenContractAddress,
          ),
        })),
      },
    );
    return result[0]?.tokenAssets ?? [];
  }

  async getTransactionHistory(params: {
    address: string;
    begin?: string;
    chains: string;
    cursor?: string;
    end?: string;
    limit?: string;
    tokenContractAddress?: string;
  }): Promise<{
    cursor?: string;
    transactions: OkxOnchainTransactionHistoryItem[];
  }> {
    const result = await this.request<OkxOnchainTransactionHistoryPage[]>(
      "GET",
      "/api/v6/dex/post-transaction/transactions-by-address",
      {
        ...params,
        tokenContractAddress: params.tokenContractAddress
          ? normalizeOkxOnchainRequestTokenAddress(params.tokenContractAddress)
          : undefined,
      },
    );

    const page = result[0];
    return {
      cursor: page?.cursor,
      transactions: page?.transactionList ?? page?.transactions ?? [],
    };
  }

  async getTransactionDetail(params: {
    chainIndex: string;
    itype?: string;
    txHash: string;
  }): Promise<OkxOnchainTransactionDetail | null> {
    const result = await this.request<OkxOnchainTransactionDetail[]>(
      "GET",
      "/api/v6/dex/post-transaction/transaction-detail-by-txhash",
      params,
    );
    return result[0] ?? null;
  }

  private async request<T>(
    method: OkxOnchainMethod,
    path: string,
    query?: OkxOnchainQuery,
    payload?: OkxOnchainPayload,
  ): Promise<T> {
    const requestPath = buildRequestPath(path, query);
    const body =
      method === "POST" && payload !== undefined ? JSON.stringify(payload) : "";
    const timestamp = this.clock();
    const signature = createOkxOnchainSignature(
      timestamp,
      method,
      requestPath,
      this.secret,
      body,
    );

    const response = await this.fetchImpl(new URL(requestPath, this.baseUrl), {
      body: body || undefined,
      headers: {
        ...DEFAULT_HEADERS,
        "OK-ACCESS-KEY": this.apiKey,
        "OK-ACCESS-PASSPHRASE": this.passphrase,
        "OK-ACCESS-SIGN": signature,
        "OK-ACCESS-TIMESTAMP": timestamp,
      },
      method,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(
        `OKX Onchain request failed with HTTP ${response.status}: ${sanitizeText(text || "<empty>")}`,
      );
    }

    let parsed: OkxOnchainEnvelope<T>;
    try {
      parsed = JSON.parse(text) as OkxOnchainEnvelope<T>;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `OKX Onchain returned invalid JSON for ${requestPath}: ${message}`,
      );
    }

    if (String(parsed.code) !== "0") {
      throw new Error(
        `OKX Onchain error ${parsed.code}: ${sanitizeText(parsed.msg || "unknown error")}`,
      );
    }

    return parsed.data;
  }
}
