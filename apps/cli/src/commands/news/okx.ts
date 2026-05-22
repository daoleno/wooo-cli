import { defineCommand } from "citty";
import { createOutput, resolveOutputOptions } from "../../core/output";
import {
  createOkxAgentClientFromConfig,
  type OkxAgentNewsArticle,
  type OkxAgentNewsPage,
} from "../../services/okx-agent/client";
import {
  formatOkxAgentTimestamp,
  truncateOkxAgentText,
} from "../../services/okx-agent/presentation";

const OKX_NEWS_IMPORTANCE = new Set(["high", "low"]);
const OKX_NEWS_SENTIMENT = new Set(["bullish", "bearish", "neutral"]);
const OKX_NEWS_SORT = new Set(["latest", "relevant"]);
const OKX_NEWS_DETAIL = new Set(["brief", "summary", "full"]);
const OKX_NEWS_PERIOD = new Set(["1h", "4h", "24h"]);
const OKX_NEWS_RANK_SORT = new Set(["hot", "bullish", "bearish"]);

const NEWS_QUERY_ARGS = {
  coins: {
    type: "string",
    description: "Comma-separated tickers, e.g. BTC,ETH",
  },
  importance: {
    type: "string",
    description: "high or low",
  },
  platform: {
    type: "string",
    description:
      "News source, e.g. blockbeats, techflowpost, odaily_flash, panews",
  },
  begin: {
    type: "string",
    description: "Start time in Unix milliseconds",
  },
  end: {
    type: "string",
    description: "End time in Unix milliseconds",
  },
  lang: {
    type: "string",
    description: "zh-CN or en-US (default: en-US)",
  },
  detail: {
    type: "string",
    description: "brief, summary, or full",
  },
  limit: {
    type: "string",
    description: "Rows to request (default: 10, max: 50)",
  },
  after: {
    type: "string",
    description: "Pagination cursor returned by the previous response",
  },
  json: { type: "boolean", default: false },
  format: { type: "string", default: "table" },
} as const;

function parseOptionalInteger(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, received: ${value}`);
  }
  return parsed;
}

function parseOptionalTimestamp(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `Expected a Unix millisecond timestamp, received: ${value}`,
    );
  }
  return parsed;
}

function normalizeCoins(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const coins = Array.from(
    new Set(
      value
        .split(",")
        .map((coin) => coin.trim().toUpperCase())
        .filter(Boolean),
    ),
  );
  if (coins.length === 0) {
    throw new Error("Coin list cannot be empty.");
  }
  return coins.join(",");
}

function resolveEnum(
  value: string | undefined,
  supported: Set<string>,
  label: string,
): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim();
  const lowered = normalized.toLowerCase();
  if (supported.has(normalized)) {
    return normalized;
  }
  if (supported.has(lowered)) {
    return lowered;
  }
  throw new Error(
    `Unsupported OKX news ${label}: ${value}. Use ${Array.from(supported).join(", ")}.`,
  );
}

function newsItems(page: OkxAgentNewsPage | null): OkxAgentNewsArticle[] {
  return page?.details ?? [];
}

function articleTime(article: OkxAgentNewsArticle): string {
  return formatOkxAgentTimestamp(article.cTime ?? article.createTime);
}

function renderNewsPage(
  out: ReturnType<typeof createOutput>,
  page: OkxAgentNewsPage | null,
  title: string,
): void {
  const items = newsItems(page);
  if (items.length === 0) {
    out.warn(`No OKX news found for ${title}.`);
    return;
  }

  out.table(
    items.map((article) => ({
      time: articleTime(article),
      importance: article.importance ?? "",
      sentiment: article.sentiment?.label ?? "",
      coins: (article.ccyList ?? []).join(","),
      platforms: (article.platformList ?? []).join(","),
      title: truncateOkxAgentText(article.title, 90),
      id: article.id ?? "",
    })),
    {
      columns: [
        "time",
        "importance",
        "sentiment",
        "coins",
        "platforms",
        "title",
        "id",
      ],
      title,
    },
  );

  if (page?.nextCursor) {
    out.data(`Next cursor: ${page.nextCursor}`);
  }
}

async function createNewsClient() {
  return await createOkxAgentClientFromConfig({ requireAuth: true });
}

function okxNewsLatestCommand() {
  return defineCommand({
    meta: { name: "latest", description: "Get latest OKX crypto news" },
    args: NEWS_QUERY_ARGS,
    async run({ args }) {
      const out = createOutput(resolveOutputOptions(args));
      const client = await createNewsClient();
      const page = await client.getNewsLatest({
        after: args.after,
        begin: parseOptionalTimestamp(args.begin),
        coins: normalizeCoins(args.coins),
        detailLvl: resolveEnum(args.detail, OKX_NEWS_DETAIL, "detail level"),
        end: parseOptionalTimestamp(args.end),
        importance: resolveEnum(
          args.importance,
          OKX_NEWS_IMPORTANCE,
          "importance",
        ),
        language: args.lang,
        limit: parseOptionalInteger(args.limit),
        platform: args.platform,
      });

      if (args.json || args.format === "json") {
        out.data({
          provider: "okx-agent-news",
          items: newsItems(page),
          nextCursor: page?.nextCursor ?? null,
        });
        return;
      }

      renderNewsPage(out, page, "OKX Latest News");
    },
  });
}

function okxNewsImportantCommand() {
  return defineCommand({
    meta: {
      name: "important",
      description: "Get high-importance OKX crypto news",
    },
    args: NEWS_QUERY_ARGS,
    async run({ args }) {
      const out = createOutput(resolveOutputOptions(args));
      const client = await createNewsClient();
      const page = await client.getNewsLatest({
        after: args.after,
        begin: parseOptionalTimestamp(args.begin),
        coins: normalizeCoins(args.coins),
        detailLvl: resolveEnum(args.detail, OKX_NEWS_DETAIL, "detail level"),
        end: parseOptionalTimestamp(args.end),
        importance: "high",
        language: args.lang,
        limit: parseOptionalInteger(args.limit),
        platform: args.platform,
      });

      if (args.json || args.format === "json") {
        out.data({
          provider: "okx-agent-news",
          items: newsItems(page),
          nextCursor: page?.nextCursor ?? null,
        });
        return;
      }

      renderNewsPage(out, page, "OKX Important News");
    },
  });
}

function okxNewsByCoinCommand() {
  return defineCommand({
    meta: { name: "by-coin", description: "Get OKX news for specific coins" },
    args: {
      ...NEWS_QUERY_ARGS,
      coins: {
        type: "string",
        description: "Comma-separated tickers, e.g. BTC,ETH",
        required: true,
      },
    },
    async run({ args }) {
      const out = createOutput(resolveOutputOptions(args));
      const client = await createNewsClient();
      const page = await client.getNewsByCoin({
        begin: parseOptionalTimestamp(args.begin),
        coins: normalizeCoins(args.coins) ?? args.coins,
        detailLvl: resolveEnum(args.detail, OKX_NEWS_DETAIL, "detail level"),
        end: parseOptionalTimestamp(args.end),
        importance: resolveEnum(
          args.importance,
          OKX_NEWS_IMPORTANCE,
          "importance",
        ),
        language: args.lang,
        limit: parseOptionalInteger(args.limit),
        platform: args.platform,
      });

      if (args.json || args.format === "json") {
        out.data({
          provider: "okx-agent-news",
          coins: normalizeCoins(args.coins),
          items: newsItems(page),
        });
        return;
      }

      renderNewsPage(out, page, `OKX News: ${normalizeCoins(args.coins)}`);
    },
  });
}

function okxNewsSearchCommand() {
  return defineCommand({
    meta: { name: "search", description: "Search OKX crypto news" },
    args: {
      keyword: {
        type: "positional",
        description: "Search keyword or topic",
        required: true,
      },
      sentiment: {
        type: "string",
        description: "bullish, bearish, or neutral",
      },
      sortBy: {
        type: "string",
        description: "latest or relevant (default: relevant)",
      },
      ...NEWS_QUERY_ARGS,
    },
    async run({ args }) {
      const out = createOutput(resolveOutputOptions(args));
      const client = await createNewsClient();
      const page = await client.searchNews({
        after: args.after,
        begin: parseOptionalTimestamp(args.begin),
        coins: normalizeCoins(args.coins),
        detailLvl: resolveEnum(args.detail, OKX_NEWS_DETAIL, "detail level"),
        end: parseOptionalTimestamp(args.end),
        importance: resolveEnum(
          args.importance,
          OKX_NEWS_IMPORTANCE,
          "importance",
        ),
        keyword: args.keyword,
        language: args.lang,
        limit: parseOptionalInteger(args.limit),
        platform: args.platform,
        sentiment: resolveEnum(args.sentiment, OKX_NEWS_SENTIMENT, "sentiment"),
        sortBy: resolveEnum(args.sortBy, OKX_NEWS_SORT, "sort"),
      });

      if (args.json || args.format === "json") {
        out.data({
          provider: "okx-agent-news",
          keyword: args.keyword,
          items: newsItems(page),
          nextCursor: page?.nextCursor ?? null,
        });
        return;
      }

      renderNewsPage(out, page, `OKX News Search: ${args.keyword}`);
    },
  });
}

function okxNewsBySentimentCommand() {
  return defineCommand({
    meta: {
      name: "by-sentiment",
      description: "Browse OKX news filtered by sentiment",
    },
    args: {
      sentiment: {
        type: "string",
        description: "bullish, bearish, or neutral",
        required: true,
      },
      sortBy: {
        type: "string",
        description: "latest or relevant (default: latest)",
      },
      ...NEWS_QUERY_ARGS,
    },
    async run({ args }) {
      const out = createOutput(resolveOutputOptions(args));
      const client = await createNewsClient();
      const sentiment = resolveEnum(
        args.sentiment,
        OKX_NEWS_SENTIMENT,
        "sentiment",
      );
      const page = await client.searchNews({
        after: args.after,
        begin: parseOptionalTimestamp(args.begin),
        coins: normalizeCoins(args.coins),
        detailLvl: resolveEnum(args.detail, OKX_NEWS_DETAIL, "detail level"),
        end: parseOptionalTimestamp(args.end),
        importance: resolveEnum(
          args.importance,
          OKX_NEWS_IMPORTANCE,
          "importance",
        ),
        language: args.lang,
        limit: parseOptionalInteger(args.limit),
        platform: args.platform,
        sentiment,
        sortBy: resolveEnum(args.sortBy, OKX_NEWS_SORT, "sort") ?? "latest",
      });

      if (args.json || args.format === "json") {
        out.data({
          provider: "okx-agent-news",
          sentiment,
          items: newsItems(page),
          nextCursor: page?.nextCursor ?? null,
        });
        return;
      }

      renderNewsPage(out, page, `OKX News Sentiment: ${sentiment}`);
    },
  });
}

function okxNewsDetailCommand() {
  return defineCommand({
    meta: { name: "detail", description: "Get OKX news article detail by ID" },
    args: {
      id: {
        type: "positional",
        description: "News article ID",
        required: true,
      },
      lang: {
        type: "string",
        description: "zh-CN or en-US (default: en-US)",
      },
      json: { type: "boolean", default: false },
      format: { type: "string", default: "table" },
    },
    async run({ args }) {
      const out = createOutput(resolveOutputOptions(args));
      const client = await createNewsClient();
      const article = await client.getNewsDetail({
        id: args.id,
        language: args.lang,
      });

      if (args.json || args.format === "json") {
        out.data({
          provider: "okx-agent-news",
          article,
        });
        return;
      }

      if (!article) {
        out.warn(`No OKX news article found for ${args.id}.`);
        return;
      }

      out.table(
        [
          {
            time: articleTime(article),
            importance: article.importance ?? "",
            coins: (article.ccyList ?? []).join(","),
            platforms: (article.platformList ?? []).join(","),
            title: truncateOkxAgentText(article.title, 120),
            url: article.sourceUrl ?? "",
            id: article.id ?? args.id,
          },
        ],
        {
          columns: [
            "time",
            "importance",
            "coins",
            "platforms",
            "title",
            "url",
            "id",
          ],
          title: "OKX News Detail",
        },
      );
      if (article.summary) {
        out.data(`Summary: ${article.summary}`);
      }
      if (article.content) {
        out.data(`Content: ${truncateOkxAgentText(article.content, 500)}`);
      }
    },
  });
}

function okxNewsPlatformsCommand() {
  return defineCommand({
    meta: {
      name: "platforms",
      description: "List OKX news source platforms",
    },
    args: {
      json: { type: "boolean", default: false },
      format: { type: "string", default: "table" },
    },
    async run({ args }) {
      const out = createOutput(resolveOutputOptions(args));
      const client = await createNewsClient();
      const platforms = await client.listNewsPlatforms();

      if (args.json || args.format === "json") {
        out.data({
          provider: "okx-agent-news",
          platforms,
        });
        return;
      }

      if (platforms.length === 0) {
        out.warn("No OKX news platforms returned.");
        return;
      }

      out.table(
        platforms.map((platform) => ({ platform })),
        {
          columns: ["platform"],
          title: "OKX News Platforms",
        },
      );
    },
  });
}

function okxNewsCoinSentimentCommand() {
  return defineCommand({
    meta: {
      name: "coin-sentiment",
      description: "Get OKX coin sentiment snapshots",
    },
    args: {
      coins: {
        type: "string",
        description: "Comma-separated tickers, e.g. BTC,ETH",
        required: true,
      },
      period: {
        type: "string",
        description: "1h, 4h, or 24h (default: 24h)",
      },
      json: { type: "boolean", default: false },
      format: { type: "string", default: "table" },
    },
    async run({ args }) {
      const out = createOutput(resolveOutputOptions(args));
      const client = await createNewsClient();
      const coins = normalizeCoins(args.coins) ?? args.coins;
      const period = resolveEnum(args.period, OKX_NEWS_PERIOD, "period");
      const page = await client.getCoinSentiment({
        coins,
        period,
      });
      const items = page?.details ?? [];

      if (args.json || args.format === "json") {
        out.data({
          provider: "okx-agent-news",
          coins,
          period: period ?? "24h",
          items,
        });
        return;
      }

      if (items.length === 0) {
        out.warn(`No OKX coin sentiment returned for ${coins}.`);
        return;
      }

      out.table(
        items.map((item) => ({
          symbol: item.ccy ?? "",
          label: item.sentiment?.label ?? "",
          bullish: item.sentiment?.bullishRatio ?? "",
          bearish: item.sentiment?.bearishRatio ?? "",
          mentions: item.mentionCnt ?? "",
        })),
        {
          columns: ["symbol", "label", "bullish", "bearish", "mentions"],
          title: "OKX Coin Sentiment",
        },
      );
    },
  });
}

function okxNewsCoinTrendCommand() {
  return defineCommand({
    meta: {
      name: "coin-trend",
      description: "Get OKX coin sentiment trend over time",
    },
    args: {
      coin: {
        type: "positional",
        description: "Coin ticker, e.g. BTC",
        required: true,
      },
      period: {
        type: "string",
        description: "1h, 4h, or 24h (default: 1h)",
      },
      points: {
        type: "string",
        description: "Trend data points (default: 24)",
        default: "24",
      },
      json: { type: "boolean", default: false },
      format: { type: "string", default: "table" },
    },
    async run({ args }) {
      const out = createOutput(resolveOutputOptions(args));
      const client = await createNewsClient();
      const coin = normalizeCoins(args.coin) ?? args.coin.toUpperCase();
      const period = resolveEnum(args.period, OKX_NEWS_PERIOD, "period");
      const trendPoints = parseOptionalInteger(args.points) ?? 24;
      const page = await client.getCoinSentiment({
        coins: coin,
        period,
        trendPoints,
      });
      const item = page?.details?.[0];
      const trend = item?.trend ?? [];

      if (args.json || args.format === "json") {
        out.data({
          provider: "okx-agent-news",
          coin,
          period: period ?? "1h",
          trend,
        });
        return;
      }

      if (trend.length === 0) {
        out.warn(`No OKX sentiment trend returned for ${coin}.`);
        return;
      }

      out.table(
        trend.map((point) => ({
          time: formatOkxAgentTimestamp(point.ts),
          bullish: point.bullishRatio ?? "",
          bearish: point.bearishRatio ?? "",
          mentions: point.mentionCnt ?? "",
        })),
        {
          columns: ["time", "bullish", "bearish", "mentions"],
          title: `OKX Sentiment Trend: ${coin}`,
        },
      );
    },
  });
}

function okxNewsSentimentRankCommand() {
  return defineCommand({
    meta: {
      name: "sentiment-rank",
      description: "Rank coins by OKX social hotness or sentiment direction",
    },
    args: {
      period: {
        type: "string",
        description: "1h, 4h, or 24h (default: 24h)",
      },
      sortBy: {
        type: "string",
        description: "hot, bullish, or bearish",
      },
      limit: {
        type: "string",
        description: "Rows to request (default: 10, max: 50)",
      },
      json: { type: "boolean", default: false },
      format: { type: "string", default: "table" },
    },
    async run({ args }) {
      const out = createOutput(resolveOutputOptions(args));
      const client = await createNewsClient();
      const period = resolveEnum(args.period, OKX_NEWS_PERIOD, "period");
      const sortBy = resolveEnum(args.sortBy, OKX_NEWS_RANK_SORT, "rank sort");
      const page = await client.getSentimentRanking({
        limit: parseOptionalInteger(args.limit),
        period,
        sortBy,
      });
      const items = page?.details ?? [];

      if (args.json || args.format === "json") {
        out.data({
          provider: "okx-agent-news",
          period: period ?? "24h",
          sortBy: sortBy ?? "hot",
          items,
        });
        return;
      }

      if (items.length === 0) {
        out.warn("No OKX sentiment ranking returned.");
        return;
      }

      out.table(
        items.map((item, index) => ({
          rank: index + 1,
          symbol: item.ccy ?? "",
          label: item.sentiment?.label ?? "",
          bullish: item.sentiment?.bullishRatio ?? "",
          bearish: item.sentiment?.bearishRatio ?? "",
          mentions: item.mentionCnt ?? "",
        })),
        {
          columns: [
            "rank",
            "symbol",
            "label",
            "bullish",
            "bearish",
            "mentions",
          ],
          title: "OKX Sentiment Ranking",
        },
      );
    },
  });
}

export default defineCommand({
  meta: {
    name: "okx",
    description: "OKX Agent news and sentiment radar",
  },
  subCommands: {
    latest: okxNewsLatestCommand,
    important: okxNewsImportantCommand,
    "by-coin": okxNewsByCoinCommand,
    search: okxNewsSearchCommand,
    "by-sentiment": okxNewsBySentimentCommand,
    detail: okxNewsDetailCommand,
    platforms: okxNewsPlatformsCommand,
    "coin-sentiment": okxNewsCoinSentimentCommand,
    "coin-trend": okxNewsCoinTrendCommand,
    "sentiment-rank": okxNewsSentimentRankCommand,
  },
});
