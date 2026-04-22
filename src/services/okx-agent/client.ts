import { createHmac } from "node:crypto";
import { loadWoooConfig } from "../../core/config";

const DEFAULT_OKX_AGENT_BASE_URL = "https://www.okx.com";
const DEFAULT_HEADERS = {
  accept: "application/json",
  "content-type": "application/json",
  "user-agent": "wooo-cli",
} as const;

type OkxAgentMethod = "GET" | "POST";
type OkxAgentQueryValue = boolean | number | string | undefined;
type OkxAgentQuery = Record<string, OkxAgentQueryValue>;
type OkxAgentPayload = Record<string, unknown>;

interface OkxAgentEnvelope<T> {
  code: number | string;
  data: T;
  msg?: string;
}

export interface OkxAgentCredentials {
  apiKey: string;
  secret: string;
  passphrase: string;
}

export interface OkxAgentClientOptions extends Partial<OkxAgentCredentials> {
  baseUrl?: string;
  clock?: () => string;
  fetchImpl?: typeof fetch;
}

export interface OkxAgentMarketFilterRow {
  chg24hPct?: string;
  fundingRate?: string;
  instId?: string;
  last?: string;
  listTime?: string;
  marketCapUsd?: string;
  oiUsd?: string;
  rank?: number | string;
  sortVal?: number | string;
  volUsd24h?: string;
}

export interface OkxAgentMarketFilterResult {
  rows?: OkxAgentMarketFilterRow[];
  total?: number | string;
}

export interface OkxAgentOiHistoryRow {
  oi?: string;
  oiCcy?: string;
  oiCont?: string;
  oiDeltaPct?: string;
  oiDeltaUsd?: string;
  oiUsd?: string;
  ts?: string;
}

export interface OkxAgentOiHistoryResult {
  bar?: string;
  instId?: string;
  rows?: OkxAgentOiHistoryRow[];
}

export interface OkxAgentOiChangeRow {
  fundingRate?: string;
  instId?: string;
  last?: string;
  oiDeltaPct?: string;
  oiDeltaUsd?: string;
  oiUsd?: string;
  pxChgPct?: string;
  rank?: number | string;
  volUsd24h?: string;
}

export interface OkxAgentNewsArticle {
  cTime?: string;
  ccyList?: string[];
  content?: string;
  createTime?: string;
  id?: string;
  importance?: string;
  platformList?: string[];
  sentiment?: OkxAgentSentimentValue;
  sourceUrl?: string;
  summary?: string;
  title?: string;
}

export interface OkxAgentNewsPage {
  details?: OkxAgentNewsArticle[];
  nextCursor?: string;
}

export interface OkxAgentSentimentValue {
  bearishRatio?: string;
  bullishRatio?: string;
  label?: string;
}

export interface OkxAgentSentimentTrendPoint {
  bearishRatio?: string;
  bullishRatio?: string;
  mentionCnt?: number | string;
  ts?: string;
}

export interface OkxAgentSentimentDetail {
  ccy?: string;
  mentionCnt?: number | string;
  sentiment?: OkxAgentSentimentValue;
  trend?: OkxAgentSentimentTrendPoint[];
}

export interface OkxAgentSentimentPage {
  details?: OkxAgentSentimentDetail[];
}

function sanitizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 500);
}

function encodeQuery(query?: OkxAgentQuery): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === "") {
      continue;
    }
    params.set(key, String(value));
  }
  return params;
}

function buildRequestPath(path: string, query?: OkxAgentQuery): string {
  const searchParams = encodeQuery(query).toString();
  return searchParams ? `${path}?${searchParams}` : path;
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  const compacted: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined && entry !== "") {
      compacted[key] = entry;
    }
  }
  return compacted as T;
}

function unwrapFirst<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function newsLanguageHeader(
  language: string | undefined,
): Record<string, string> {
  const normalized = language?.trim().toLowerCase();
  if (normalized === "zh-cn" || normalized === "zh_cn" || normalized === "zh") {
    return { "Accept-Language": "zh-CN" };
  }
  return { "Accept-Language": "en-US" };
}

export function createOkxAgentSignature(
  timestamp: string,
  method: OkxAgentMethod,
  requestPath: string,
  secret: string,
  body = "",
): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}${method}${requestPath}${body}`)
    .digest("base64");
}

export async function resolveOkxAgentClientOptionsFromConfig(options?: {
  requireAuth?: boolean;
}): Promise<OkxAgentClientOptions> {
  const config = await loadWoooConfig();
  const section = config.okx;

  const apiKey = process.env.WOOO_OKX_API_KEY || section?.apiKey || undefined;
  const secret =
    process.env.WOOO_OKX_API_SECRET || section?.apiSecret || undefined;
  const passphrase =
    process.env.WOOO_OKX_PASSPHRASE || section?.passphrase || undefined;
  const baseUrl =
    process.env.WOOO_OKX_BASE_URL ||
    process.env.WOOO_OKX_API_BASE_URL ||
    section?.baseUrl ||
    DEFAULT_OKX_AGENT_BASE_URL;

  if (options?.requireAuth && (!apiKey || !secret || !passphrase)) {
    console.error("Error: OKX API credentials are not configured.");
    console.error(
      "Set WOOO_OKX_API_KEY, WOOO_OKX_API_SECRET, and WOOO_OKX_PASSPHRASE, or run:",
    );
    console.error("  wooo-cli config set okx.apiKey <key>");
    console.error("  wooo-cli config set okx.apiSecret <secret>");
    console.error("  wooo-cli config set okx.passphrase <passphrase>");
    process.exit(3);
  }

  return {
    apiKey,
    baseUrl,
    passphrase,
    secret,
  };
}

export async function createOkxAgentClientFromConfig(options?: {
  requireAuth?: boolean;
}): Promise<OkxAgentClient> {
  return new OkxAgentClient(
    await resolveOkxAgentClientOptionsFromConfig(options),
  );
}

export class OkxAgentClient {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly clock: () => string;
  private readonly fetchImpl: typeof fetch;
  private readonly passphrase?: string;
  private readonly secret?: string;

  constructor(options: OkxAgentClientOptions = {}) {
    this.apiKey = options.apiKey;
    this.secret = options.secret;
    this.passphrase = options.passphrase;
    this.baseUrl = options.baseUrl || DEFAULT_OKX_AGENT_BASE_URL;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.clock = options.clock ?? (() => new Date().toISOString());
  }

  async marketFilter(params: {
    baseCcy?: string;
    ctType?: string;
    instFamily?: string;
    instType: string;
    limit?: number;
    maxChg24hPct?: string;
    maxFundingRate?: string;
    maxLast?: string;
    maxMarketCapUsd?: string;
    maxOiUsd?: string;
    maxVolUsd24h?: string;
    minChg24hPct?: string;
    minFundingRate?: string;
    minLast?: string;
    minMarketCapUsd?: string;
    minOiUsd?: string;
    minVolUsd24h?: string;
    quoteCcy?: string;
    settleCcy?: string;
    sortBy?: string;
    sortOrder?: string;
  }): Promise<OkxAgentMarketFilterResult> {
    return await this.publicPost<OkxAgentMarketFilterResult>(
      "/api/v5/aigc/mcp/market-filter",
      compactObject(params),
    );
  }

  async getOiHistory(params: {
    bar?: string;
    instId: string;
    limit?: number;
    ts?: number;
  }): Promise<OkxAgentOiHistoryResult> {
    return await this.publicPost<OkxAgentOiHistoryResult>(
      "/api/v5/aigc/mcp/oi-history",
      compactObject(params),
    );
  }

  async filterOiChange(params: {
    bar?: string;
    instType: string;
    limit?: number;
    minAbsOiDeltaPct?: string;
    minOiUsd?: string;
    minVolUsd24h?: string;
    sortBy?: string;
    sortOrder?: string;
  }): Promise<OkxAgentOiChangeRow[]> {
    return await this.publicPost<OkxAgentOiChangeRow[]>(
      "/api/v5/aigc/mcp/oi-change-filter",
      compactObject(params),
    );
  }

  async getNewsLatest(params: {
    after?: string;
    begin?: number;
    coins?: string;
    detailLvl?: string;
    end?: number;
    importance?: string;
    language?: string;
    limit?: number;
    platform?: string;
  }): Promise<OkxAgentNewsPage | null> {
    return unwrapFirst(
      await this.privateGet<OkxAgentNewsPage[] | OkxAgentNewsPage>(
        "/api/v5/orbit/news-search",
        compactObject({
          begin: params.begin,
          ccyList: params.coins,
          cursor: params.after,
          detailLvl: params.detailLvl,
          end: params.end,
          importance: params.importance,
          limit: params.limit ?? 10,
          platform: params.platform,
          sortBy: "latest",
        }),
        newsLanguageHeader(params.language),
      ),
    );
  }

  async getNewsByCoin(params: {
    begin?: number;
    coins: string;
    detailLvl?: string;
    end?: number;
    importance?: string;
    language?: string;
    limit?: number;
    platform?: string;
  }): Promise<OkxAgentNewsPage | null> {
    return unwrapFirst(
      await this.privateGet<OkxAgentNewsPage[] | OkxAgentNewsPage>(
        "/api/v5/orbit/news-search",
        compactObject({
          begin: params.begin,
          ccyList: params.coins,
          detailLvl: params.detailLvl,
          end: params.end,
          importance: params.importance,
          limit: params.limit ?? 10,
          platform: params.platform,
          sortBy: "latest",
        }),
        newsLanguageHeader(params.language),
      ),
    );
  }

  async searchNews(params: {
    after?: string;
    begin?: number;
    coins?: string;
    detailLvl?: string;
    end?: number;
    importance?: string;
    keyword?: string;
    language?: string;
    limit?: number;
    platform?: string;
    sentiment?: string;
    sortBy?: string;
  }): Promise<OkxAgentNewsPage | null> {
    return unwrapFirst(
      await this.privateGet<OkxAgentNewsPage[] | OkxAgentNewsPage>(
        "/api/v5/orbit/news-search",
        compactObject({
          begin: params.begin,
          ccyList: params.coins,
          cursor: params.after,
          detailLvl: params.detailLvl,
          end: params.end,
          importance: params.importance,
          keyword: params.keyword,
          limit: params.limit ?? 10,
          platform: params.platform,
          sentiment: params.sentiment,
          sortBy: params.sortBy ?? "relevant",
        }),
        newsLanguageHeader(params.language),
      ),
    );
  }

  async getNewsDetail(params: {
    id: string;
    language?: string;
  }): Promise<OkxAgentNewsArticle | null> {
    return unwrapFirst(
      await this.privateGet<OkxAgentNewsArticle[] | OkxAgentNewsArticle>(
        "/api/v5/orbit/news-detail",
        { id: params.id },
        newsLanguageHeader(params.language),
      ),
    );
  }

  async listNewsPlatforms(): Promise<string[]> {
    const page = unwrapFirst(
      await this.privateGet<
        Array<{ platform?: unknown }> | { platform?: unknown }
      >("/api/v5/orbit/news-platform"),
    );
    return Array.isArray(page?.platform)
      ? page.platform.filter(
          (entry): entry is string => typeof entry === "string",
        )
      : [];
  }

  async getCoinSentiment(params: {
    coins: string;
    period?: string;
    trendPoints?: number;
  }): Promise<OkxAgentSentimentPage | null> {
    const includeTrend = params.trendPoints !== undefined;
    return unwrapFirst(
      await this.privateGet<OkxAgentSentimentPage[] | OkxAgentSentimentPage>(
        "/api/v5/orbit/currency-sentiment-query",
        compactObject({
          ccy: params.coins,
          inclTrend: includeTrend ? true : undefined,
          limit: params.trendPoints,
          period: params.period ?? (includeTrend ? "1h" : "24h"),
        }),
      ),
    );
  }

  async getSentimentRanking(params: {
    limit?: number;
    period?: string;
    sortBy?: string;
  }): Promise<OkxAgentSentimentPage | null> {
    return unwrapFirst(
      await this.privateGet<OkxAgentSentimentPage[] | OkxAgentSentimentPage>(
        "/api/v5/orbit/currency-sentiment-ranking",
        compactObject({
          limit: params.limit ?? 10,
          period: params.period ?? "24h",
          sortBy: params.sortBy ?? "hot",
        }),
      ),
    );
  }

  private async publicPost<T>(
    path: string,
    payload?: OkxAgentPayload,
  ): Promise<T> {
    return await this.request<T>({
      auth: false,
      method: "POST",
      path,
      payload,
    });
  }

  private async privateGet<T>(
    path: string,
    query?: OkxAgentQuery,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    return await this.request<T>({
      auth: true,
      extraHeaders,
      method: "GET",
      path,
      query,
    });
  }

  private async request<T>(params: {
    auth: boolean;
    extraHeaders?: Record<string, string>;
    method: OkxAgentMethod;
    path: string;
    payload?: OkxAgentPayload;
    query?: OkxAgentQuery;
  }): Promise<T> {
    const requestPath = buildRequestPath(params.path, params.query);
    const body =
      params.method === "POST" && params.payload !== undefined
        ? JSON.stringify(params.payload)
        : "";
    const headers: Record<string, string> = {
      ...DEFAULT_HEADERS,
      ...params.extraHeaders,
    };

    if (params.auth) {
      if (!this.apiKey || !this.secret || !this.passphrase) {
        throw new Error(
          "OKX private API credentials are not configured. Set WOOO_OKX_API_KEY, WOOO_OKX_API_SECRET, and WOOO_OKX_PASSPHRASE.",
        );
      }

      const timestamp = this.clock();
      headers["OK-ACCESS-KEY"] = this.apiKey;
      headers["OK-ACCESS-PASSPHRASE"] = this.passphrase;
      headers["OK-ACCESS-SIGN"] = createOkxAgentSignature(
        timestamp,
        params.method,
        requestPath,
        this.secret,
        body,
      );
      headers["OK-ACCESS-TIMESTAMP"] = timestamp;
    }

    const response = await this.fetchImpl(new URL(requestPath, this.baseUrl), {
      body: body || undefined,
      headers,
      method: params.method,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(
        `OKX Agent request failed with HTTP ${response.status}: ${sanitizeText(text || "<empty>")}`,
      );
    }

    let parsed: OkxAgentEnvelope<T>;
    try {
      parsed = JSON.parse(text) as OkxAgentEnvelope<T>;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `OKX Agent returned invalid JSON for ${requestPath}: ${message}`,
      );
    }

    if (String(parsed.code) !== "0") {
      throw new Error(
        `OKX Agent error ${parsed.code}: ${sanitizeText(parsed.msg || "unknown error")}`,
      );
    }

    return parsed.data;
  }
}
