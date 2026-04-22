import { defineCommand } from "citty";
import { createOutput, resolveOutputOptions } from "../../core/output";
import {
  createOkxOnchainClientFromConfig,
  normalizeOkxOnchainTokenAddress,
  resolveOkxOnchainChainIndex,
  resolveOkxOnchainChainSelection,
} from "../../services/okx-onchain/client";
import {
  formatOkxOnchainAmount,
  formatOkxOnchainChainLabel,
  formatOkxOnchainPercent,
  formatOkxOnchainTimestamp,
  formatOkxOnchainUsd,
} from "../../services/okx-onchain/presentation";
import {
  okxAgentMarketFilterCommand,
  okxAgentMarketOiChangeCommand,
  okxAgentMarketOiHistoryCommand,
} from "./okx-agent";

const OKX_ONCHAIN_TAG_FILTERS = {
  bundle: "9",
  developer: "2",
  kol: "1",
  "new-wallet": "5",
  phishing: "8",
  smart: "3",
  "smart-money": "3",
  sniper: "7",
  suspicious: "6",
  whale: "4",
} as const satisfies Record<string, string>;

const OKX_ONCHAIN_RANKING_SORT = {
  "market-cap": "6",
  change: "2",
  marketcap: "6",
  volume: "5",
} as const satisfies Record<string, string>;

const OKX_ONCHAIN_RANKING_WINDOW = {
  "1": "1",
  "1h": "2",
  "24h": "4",
  "4h": "3",
  "5m": "1",
  "60m": "2",
  "240m": "3",
} as const satisfies Record<string, string>;

function resolveOkxOnchainTagFilter(
  value: string | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (/^[1-9]$/.test(normalized)) {
    return normalized;
  }

  const resolved =
    OKX_ONCHAIN_TAG_FILTERS[normalized as keyof typeof OKX_ONCHAIN_TAG_FILTERS];
  if (!resolved) {
    throw new Error(
      `Unsupported OKX Onchain tag filter: ${value}. Use kol, developer, smart-money, whale, new-wallet, suspicious, sniper, phishing, bundle, or a numeric code 1-9.`,
    );
  }
  return resolved;
}

function resolveOkxOnchainRankingSort(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (/^[256]$/.test(normalized)) {
    return normalized;
  }

  const resolved =
    OKX_ONCHAIN_RANKING_SORT[
      normalized as keyof typeof OKX_ONCHAIN_RANKING_SORT
    ];
  if (!resolved) {
    throw new Error(
      `Unsupported OKX Onchain ranking sort: ${value}. Use change, volume, market-cap, or codes 2, 5, 6.`,
    );
  }
  return resolved;
}

function resolveOkxOnchainRankingWindow(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (/^[1-4]$/.test(normalized)) {
    return normalized;
  }

  const resolved =
    OKX_ONCHAIN_RANKING_WINDOW[
      normalized as keyof typeof OKX_ONCHAIN_RANKING_WINDOW
    ];
  if (!resolved) {
    throw new Error(
      `Unsupported OKX Onchain ranking window: ${value}. Use 5m, 1h, 4h, 24h, or codes 1-4.`,
    );
  }
  return resolved;
}

function okxMarketChainsCommand() {
  return defineCommand({
    meta: {
      name: "chains",
      description: "List supported OKX Onchain chains",
    },
    args: {
      json: { type: "boolean", default: false },
      format: { type: "string", default: "table" },
    },
    async run({ args }) {
      const out = createOutput(resolveOutputOptions(args));
      const client = await createOkxOnchainClientFromConfig();
      const chains = await client.listSupportedChains();

      if (args.json || args.format === "json") {
        out.data({ provider: "okx-onchain", chains });
        return;
      }

      out.table(
        chains.map((chain) => ({
          chain: chain.chainIndex,
          name: chain.name ?? "",
          short: chain.shortName ?? "",
        })),
        {
          columns: ["chain", "name", "short"],
          title: "OKX Onchain Supported Chains",
        },
      );
    },
  });
}

function okxMarketSearchCommand() {
  return defineCommand({
    meta: {
      name: "search",
      description: "Search OKX Onchain tokens by symbol or address",
    },
    args: {
      query: {
        type: "positional",
        description: "Token symbol or contract address",
        required: true,
      },
      chains: {
        type: "string",
        description:
          "Comma-separated chain names or chainIndex values, e.g. ethereum,base or 1,8453",
        required: true,
      },
      max: {
        type: "string",
        description: "Maximum rows to return locally (default: 20)",
        default: "20",
      },
      json: { type: "boolean", default: false },
      format: { type: "string", default: "table" },
    },
    async run({ args }) {
      const out = createOutput(resolveOutputOptions(args));
      const client = await createOkxOnchainClientFromConfig();
      const selection = resolveOkxOnchainChainSelection(args.chains);
      const max = Math.max(1, Number.parseInt(args.max, 10) || 20);
      const results = (
        await client.searchTokens({
          chains: selection.query,
          search: args.query,
        })
      ).slice(0, max);

      if (results.length === 0) {
        out.warn(`No OKX Onchain tokens found for "${args.query}".`);
        return;
      }

      if (args.json || args.format === "json") {
        out.data({
          provider: "okx-onchain",
          query: args.query,
          chains: selection.chainIndexes,
          results,
        });
        return;
      }

      out.table(
        results.map((token) => ({
          chain: formatOkxOnchainChainLabel(token.chainIndex),
          symbol: token.tokenSymbol ?? "",
          name: token.tokenName ?? "",
          price: formatOkxOnchainUsd(token.price, 6),
          "24h": formatOkxOnchainPercent(token.change),
          address: token.tokenContractAddress,
        })),
        {
          columns: ["chain", "symbol", "name", "price", "24h", "address"],
          title: `OKX Onchain Search: ${args.query}`,
        },
      );
    },
  });
}

function okxMarketTokenCommand() {
  return defineCommand({
    meta: {
      name: "token",
      description: "Get OKX Onchain token metadata",
    },
    args: {
      chain: {
        type: "positional",
        description: "Chain name or chainIndex",
        required: true,
      },
      address: {
        type: "positional",
        description: "Token contract address",
        required: true,
      },
      json: { type: "boolean", default: false },
      format: { type: "string", default: "table" },
    },
    async run({ args }) {
      const out = createOutput(resolveOutputOptions(args));
      const client = await createOkxOnchainClientFromConfig();
      const chainIndex = resolveOkxOnchainChainIndex(args.chain);
      const token = await client.getTokenInfo({
        chainIndex,
        tokenContractAddress: normalizeOkxOnchainTokenAddress(args.address),
      });

      if (!token) {
        out.warn(
          `No OKX Onchain token found for ${args.address} on ${args.chain}.`,
        );
        return;
      }

      if (args.json || args.format === "json") {
        out.data({
          provider: "okx-onchain",
          chain: chainIndex,
          token,
        });
        return;
      }

      out.table(
        [
          {
            chain: formatOkxOnchainChainLabel(token.chainIndex),
            symbol: token.tokenSymbol ?? "",
            name: token.tokenName ?? "",
            decimals: token.decimal ?? "",
            verified: token.tagList?.communityRecognized ? "yes" : "no",
            address: token.tokenContractAddress,
          },
        ],
        {
          columns: [
            "chain",
            "symbol",
            "name",
            "decimals",
            "verified",
            "address",
          ],
          title: "OKX Onchain Token",
        },
      );
    },
  });
}

function okxMarketMetricsCommand() {
  return defineCommand({
    meta: {
      name: "metrics",
      description: "Get OKX Onchain token market metrics",
    },
    args: {
      chain: {
        type: "positional",
        description: "Chain name or chainIndex",
        required: true,
      },
      address: {
        type: "positional",
        description: "Token contract address",
        required: true,
      },
      json: { type: "boolean", default: false },
      format: { type: "string", default: "table" },
    },
    async run({ args }) {
      const out = createOutput(resolveOutputOptions(args));
      const client = await createOkxOnchainClientFromConfig();
      const chainIndex = resolveOkxOnchainChainIndex(args.chain);
      const metrics = await client.getTokenPriceInfo({
        chainIndex,
        tokenContractAddress: normalizeOkxOnchainTokenAddress(args.address),
      });

      if (!metrics) {
        out.warn(
          `No OKX Onchain market metrics found for ${args.address} on ${args.chain}.`,
        );
        return;
      }

      if (args.json || args.format === "json") {
        out.data({
          provider: "okx-onchain",
          chain: chainIndex,
          metrics,
        });
        return;
      }

      out.table(
        [
          {
            chain: formatOkxOnchainChainLabel(metrics.chainIndex),
            price: formatOkxOnchainUsd(metrics.price, 8),
            "24h": formatOkxOnchainPercent(metrics.priceChange24H),
            volume24h: formatOkxOnchainUsd(metrics.volume24H),
            txs24h: metrics.txs24H ?? "",
            liquidity: formatOkxOnchainUsd(metrics.liquidity),
            marketCap: formatOkxOnchainUsd(metrics.marketCap),
            holders: metrics.holders ?? "",
            time: formatOkxOnchainTimestamp(metrics.time),
          },
        ],
        {
          columns: [
            "chain",
            "price",
            "24h",
            "volume24h",
            "txs24h",
            "liquidity",
            "marketCap",
            "holders",
            "time",
          ],
          title: "OKX Onchain Metrics",
        },
      );
    },
  });
}

function okxMarketPriceCommand() {
  return defineCommand({
    meta: {
      name: "price",
      description: "Get the latest OKX Onchain token price",
    },
    args: {
      chain: {
        type: "positional",
        description: "Chain name or chainIndex",
        required: true,
      },
      address: {
        type: "positional",
        description: "Token contract address",
        required: true,
      },
      json: { type: "boolean", default: false },
      format: { type: "string", default: "table" },
    },
    async run({ args }) {
      const out = createOutput(resolveOutputOptions(args));
      const client = await createOkxOnchainClientFromConfig();
      const chainIndex = resolveOkxOnchainChainIndex(args.chain);
      const priceInfo = await client.getTokenPriceInfo({
        chainIndex,
        tokenContractAddress: normalizeOkxOnchainTokenAddress(args.address),
      });

      if (!priceInfo) {
        out.warn(
          `No OKX Onchain price found for ${args.address} on ${args.chain}.`,
        );
        return;
      }

      if (args.json || args.format === "json") {
        out.data({
          provider: "okx-onchain",
          chain: chainIndex,
          tokenContractAddress: priceInfo.tokenContractAddress,
          price: priceInfo.price ?? null,
          time: priceInfo.time ?? null,
          priceChange24H: priceInfo.priceChange24H ?? null,
        });
        return;
      }

      out.table(
        [
          {
            chain: formatOkxOnchainChainLabel(priceInfo.chainIndex),
            price: formatOkxOnchainUsd(priceInfo.price, 8),
            "24h": formatOkxOnchainPercent(priceInfo.priceChange24H),
            time: formatOkxOnchainTimestamp(priceInfo.time),
            address: priceInfo.tokenContractAddress,
          },
        ],
        {
          columns: ["chain", "price", "24h", "time", "address"],
          title: "OKX Onchain Price",
        },
      );
    },
  });
}

function okxMarketTradesCommand() {
  return defineCommand({
    meta: {
      name: "trades",
      description: "Get recent OKX Onchain DEX trades for a token",
    },
    args: {
      chain: {
        type: "positional",
        description: "Chain name or chainIndex",
        required: true,
      },
      address: {
        type: "positional",
        description: "Token contract address",
        required: true,
      },
      limit: {
        type: "string",
        description:
          "Maximum rows to request (default from OKX: 100, max: 500)",
      },
      after: {
        type: "string",
        description: "Pagination cursor: return trades before this trade id",
      },
      tag: {
        type: "string",
        description:
          "Optional tagged wallet filter: kol, developer, smart-money, whale, new-wallet, suspicious, sniper, phishing, bundle",
      },
      wallets: {
        type: "string",
        description: "Comma-separated wallet addresses to filter by",
      },
      json: { type: "boolean", default: false },
      format: { type: "string", default: "table" },
    },
    async run({ args }) {
      const out = createOutput(resolveOutputOptions(args));
      const client = await createOkxOnchainClientFromConfig();
      const chainIndex = resolveOkxOnchainChainIndex(args.chain);
      const trades = await client.getTrades({
        chainIndex,
        tokenContractAddress: normalizeOkxOnchainTokenAddress(args.address),
        after: args.after,
        limit: args.limit,
        tagFilter: resolveOkxOnchainTagFilter(args.tag),
        walletAddressFilter: args.wallets,
      });

      if (trades.length === 0) {
        out.warn(
          `No OKX Onchain trades found for ${args.address} on ${args.chain}.`,
        );
        return;
      }

      if (args.json || args.format === "json") {
        out.data({
          provider: "okx-onchain",
          chain: chainIndex,
          tokenContractAddress: normalizeOkxOnchainTokenAddress(args.address),
          trades,
        });
        return;
      }

      out.table(
        trades.map((trade) => ({
          time: formatOkxOnchainTimestamp(trade.time),
          type: trade.type ?? "",
          price: formatOkxOnchainUsd(trade.price, 8),
          volume: formatOkxOnchainUsd(trade.volume),
          dex: trade.dexName ?? "",
          wallet: trade.userAddress ?? "",
          legs: (trade.changedTokenInfo ?? [])
            .map((leg) =>
              `${formatOkxOnchainAmount(leg.amount)} ${leg.tokenSymbol ?? ""}`.trim(),
            )
            .join(" | "),
          id: trade.id,
        })),
        {
          columns: [
            "time",
            "type",
            "price",
            "volume",
            "dex",
            "wallet",
            "legs",
            "id",
          ],
          title: "OKX Onchain Trades",
        },
      );
    },
  });
}

function okxMarketCandlesCommand() {
  return defineCommand({
    meta: {
      name: "candles",
      description: "Get OKX Onchain historical candles for a token",
    },
    args: {
      chain: {
        type: "positional",
        description: "Chain name or chainIndex",
        required: true,
      },
      address: {
        type: "positional",
        description: "Token contract address",
        required: true,
      },
      bar: {
        type: "string",
        description:
          "Candle interval, e.g. 1s, 1m, 5m, 15m, 1H, 4H, 1D, 1Dutc (default: 1m)",
        default: "1m",
      },
      limit: {
        type: "string",
        description:
          "Maximum rows to request (default from OKX: 100, max: 299)",
      },
      after: {
        type: "string",
        description: "Pagination timestamp for older candles",
      },
      before: {
        type: "string",
        description: "Pagination timestamp for newer candles",
      },
      json: { type: "boolean", default: false },
      format: { type: "string", default: "table" },
    },
    async run({ args }) {
      const out = createOutput(resolveOutputOptions(args));
      const client = await createOkxOnchainClientFromConfig();
      const chainIndex = resolveOkxOnchainChainIndex(args.chain);
      const candles = await client.getHistoricalCandles({
        chainIndex,
        tokenContractAddress: normalizeOkxOnchainTokenAddress(args.address),
        after: args.after,
        before: args.before,
        bar: args.bar,
        limit: args.limit,
      });

      if (candles.length === 0) {
        out.warn(
          `No OKX Onchain candles found for ${args.address} on ${args.chain}.`,
        );
        return;
      }

      if (args.json || args.format === "json") {
        out.data({
          provider: "okx-onchain",
          chain: chainIndex,
          tokenContractAddress: normalizeOkxOnchainTokenAddress(args.address),
          bar: args.bar,
          candles,
        });
        return;
      }

      out.table(
        candles.map((candle) => ({
          time: formatOkxOnchainTimestamp(candle.timestamp),
          open: formatOkxOnchainUsd(candle.open, 8),
          high: formatOkxOnchainUsd(candle.high, 8),
          low: formatOkxOnchainUsd(candle.low, 8),
          close: formatOkxOnchainUsd(candle.close, 8),
          volume: formatOkxOnchainAmount(candle.volume),
          volumeUsd: formatOkxOnchainUsd(candle.volumeUsd),
          confirm: candle.confirm ?? "",
        })),
        {
          columns: [
            "time",
            "open",
            "high",
            "low",
            "close",
            "volume",
            "volumeUsd",
            "confirm",
          ],
          title: "OKX Onchain Historical Candles",
        },
      );
    },
  });
}

function okxMarketHoldersCommand() {
  return defineCommand({
    meta: {
      name: "holders",
      description: "Get top OKX Onchain token holders and PnL data",
    },
    args: {
      chain: {
        type: "positional",
        description: "Chain name or chainIndex",
        required: true,
      },
      address: {
        type: "positional",
        description: "Token contract address",
        required: true,
      },
      tag: {
        type: "string",
        description:
          "Optional tagged wallet filter: kol, developer, smart-money, whale, new-wallet, suspicious, sniper, phishing, bundle",
      },
      max: {
        type: "string",
        description: "Maximum rows to show locally (default: 20)",
        default: "20",
      },
      json: { type: "boolean", default: false },
      format: { type: "string", default: "table" },
    },
    async run({ args }) {
      const out = createOutput(resolveOutputOptions(args));
      const client = await createOkxOnchainClientFromConfig();
      const chainIndex = resolveOkxOnchainChainIndex(args.chain);
      const holders = (
        await client.getTokenHolders({
          chainIndex,
          tokenContractAddress: normalizeOkxOnchainTokenAddress(args.address),
          tagFilter: resolveOkxOnchainTagFilter(args.tag),
        })
      ).slice(0, Math.max(1, Number.parseInt(args.max, 10) || 20));

      if (holders.length === 0) {
        out.warn(
          `No OKX Onchain holders found for ${args.address} on ${args.chain}.`,
        );
        return;
      }

      if (args.json || args.format === "json") {
        out.data({
          provider: "okx-onchain",
          chain: chainIndex,
          tokenContractAddress: normalizeOkxOnchainTokenAddress(args.address),
          holders,
        });
        return;
      }

      out.table(
        holders.map((holder) => ({
          wallet: holder.holderWalletAddress ?? "",
          hold: formatOkxOnchainAmount(holder.holdAmount),
          percent: formatOkxOnchainPercent(holder.holdPercent),
          totalPnl: formatOkxOnchainUsd(holder.totalPnlUsd),
          realized: formatOkxOnchainUsd(holder.realizedPnlUsd),
          unrealized: formatOkxOnchainUsd(holder.unrealizedPnlUsd),
          funding: holder.fundingSource ?? "",
        })),
        {
          columns: [
            "wallet",
            "hold",
            "percent",
            "totalPnl",
            "realized",
            "unrealized",
            "funding",
          ],
          title: "OKX Onchain Token Holders",
        },
      );
    },
  });
}

function okxMarketRankingCommand() {
  return defineCommand({
    meta: {
      name: "ranking",
      description:
        "Get OKX Onchain token rankings by change, volume, or market cap",
    },
    args: {
      chains: {
        type: "string",
        description:
          "Comma-separated chain names or chainIndex values, e.g. ethereum,base or 1,8453",
        required: true,
      },
      sort: {
        type: "string",
        description:
          "Ranking basis: change, volume, market-cap (default: volume)",
        default: "volume",
      },
      window: {
        type: "string",
        description: "Ranking time window: 5m, 1h, 4h, 24h (default: 24h)",
        default: "24h",
      },
      max: {
        type: "string",
        description: "Maximum rows to show locally (default: 20)",
        default: "20",
      },
      json: { type: "boolean", default: false },
      format: { type: "string", default: "table" },
    },
    async run({ args }) {
      const out = createOutput(resolveOutputOptions(args));
      const selection = resolveOkxOnchainChainSelection(args.chains);
      const client = await createOkxOnchainClientFromConfig();
      const ranking = (
        await client.getTokenRanking({
          chains: selection.query,
          sortBy: resolveOkxOnchainRankingSort(args.sort),
          timeFrame: resolveOkxOnchainRankingWindow(args.window),
        })
      ).slice(0, Math.max(1, Number.parseInt(args.max, 10) || 20));

      if (ranking.length === 0) {
        out.warn(
          `No OKX Onchain ranking rows found for chains ${args.chains}.`,
        );
        return;
      }

      if (args.json || args.format === "json") {
        out.data({
          provider: "okx-onchain",
          chains: selection.chainIndexes,
          sort: args.sort,
          window: args.window,
          ranking,
        });
        return;
      }

      out.table(
        ranking.map((token) => ({
          chain: formatOkxOnchainChainLabel(token.chainIndex),
          symbol: token.tokenSymbol ?? "",
          price: formatOkxOnchainUsd(token.price, 8),
          change: formatOkxOnchainPercent(token.change),
          volume: formatOkxOnchainUsd(token.volume),
          marketCap: formatOkxOnchainUsd(token.marketCap),
          liquidity: formatOkxOnchainUsd(token.liquidity),
          traders: token.uniqueTraders ?? "",
          txs: token.txs ?? "",
          address: token.tokenContractAddress,
        })),
        {
          columns: [
            "chain",
            "symbol",
            "price",
            "change",
            "volume",
            "marketCap",
            "liquidity",
            "traders",
            "txs",
            "address",
          ],
          title: "OKX Onchain Token Ranking",
        },
      );
    },
  });
}

export default defineCommand({
  meta: { name: "okx", description: "OKX Onchain and Agent market data" },
  subCommands: {
    chains: okxMarketChainsCommand,
    search: okxMarketSearchCommand,
    token: okxMarketTokenCommand,
    metrics: okxMarketMetricsCommand,
    price: okxMarketPriceCommand,
    trades: okxMarketTradesCommand,
    candles: okxMarketCandlesCommand,
    holders: okxMarketHoldersCommand,
    ranking: okxMarketRankingCommand,
    filter: okxAgentMarketFilterCommand,
    "oi-history": okxAgentMarketOiHistoryCommand,
    "oi-change": okxAgentMarketOiChangeCommand,
  },
});
