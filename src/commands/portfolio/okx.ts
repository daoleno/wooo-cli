import { defineCommand } from "citty";
import { createOutput, resolveOutputOptions } from "../../core/output";
import {
  createOkxOnchainClientFromConfig,
  normalizeOkxOnchainTokenAddress,
  resolveOkxOnchainChainIndex,
  resolveOkxOnchainChainSelection,
} from "../../services/okx-onchain/client";
import {
  estimateOkxOnchainUsdValue,
  formatOkxOnchainAmount,
  formatOkxOnchainChainLabel,
  formatOkxOnchainPercent,
  formatOkxOnchainTimestamp,
  formatOkxOnchainUsd,
} from "../../services/okx-onchain/presentation";

const OKX_ONCHAIN_PORTFOLIO_WINDOW = {
  "1d": "1",
  "3d": "2",
  "7d": "3",
  "1m": "4",
  "24h": "1",
  "30d": "4",
  "3m": "5",
  "90d": "5",
} as const satisfies Record<string, string>;

const OKX_ONCHAIN_PORTFOLIO_WINDOW_LABEL = {
  "1": "1d",
  "2": "3d",
  "3": "7d",
  "4": "1m",
  "5": "3m",
} as const satisfies Record<string, string>;

const OKX_ONCHAIN_PORTFOLIO_DEX_HISTORY_TYPE = {
  buy: "1",
  in: "3",
  out: "4",
  sell: "2",
  "transfer-in": "3",
  transferin: "3",
  "transfer-out": "4",
  transferout: "4",
} as const satisfies Record<string, string>;

function resolveAssetType(
  value: string | undefined,
): "0" | "1" | "2" | undefined {
  const normalized = (value ?? "all").trim().toLowerCase();
  switch (normalized) {
    case "all":
      return "0";
    case "token":
    case "tokens":
      return "1";
    case "defi":
      return "2";
    default:
      throw new Error(
        `Unsupported OKX Onchain asset type: ${value}. Use all, token, or defi.`,
      );
  }
}

function resolveOkxOnchainPortfolioWindow(value: string): {
  label: string;
  timeFrame: string;
} {
  const normalized = value.trim().toLowerCase();
  if (/^[1-5]$/.test(normalized)) {
    return {
      label:
        OKX_ONCHAIN_PORTFOLIO_WINDOW_LABEL[
          normalized as keyof typeof OKX_ONCHAIN_PORTFOLIO_WINDOW_LABEL
        ],
      timeFrame: normalized,
    };
  }

  const timeFrame =
    OKX_ONCHAIN_PORTFOLIO_WINDOW[
      normalized as keyof typeof OKX_ONCHAIN_PORTFOLIO_WINDOW
    ];
  if (!timeFrame) {
    throw new Error(
      `Unsupported OKX Onchain portfolio window: ${value}. Use 1d, 3d, 7d, 1m, 3m, or codes 1-5.`,
    );
  }

  return {
    label:
      OKX_ONCHAIN_PORTFOLIO_WINDOW_LABEL[
        timeFrame as keyof typeof OKX_ONCHAIN_PORTFOLIO_WINDOW_LABEL
      ],
    timeFrame,
  };
}

function resolveOkxOnchainPortfolioDexHistoryTypes(
  value: string | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }

  const types = Array.from(
    new Set(
      value
        .split(",")
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean)
        .map((part) => {
          if (/^[1-4]$/.test(part)) {
            return part;
          }

          const resolved =
            OKX_ONCHAIN_PORTFOLIO_DEX_HISTORY_TYPE[
              part as keyof typeof OKX_ONCHAIN_PORTFOLIO_DEX_HISTORY_TYPE
            ];
          if (!resolved) {
            throw new Error(
              `Unsupported OKX Onchain DEX history type: ${part}. Use buy, sell, transfer-in, transfer-out, in, out, or codes 1-4.`,
            );
          }

          return resolved;
        }),
    ),
  );

  return types.length > 0 ? types.join(",") : undefined;
}

function formatOkxOnchainNumericOrText(
  value: string | undefined,
  formatter: (value: string) => string,
): string {
  const normalized = value?.trim();
  if (!normalized) {
    return "";
  }
  if (/^-?\d+(\.\d+)?$/.test(normalized)) {
    return formatter(normalized);
  }
  return normalized;
}

function formatOkxOnchainDexHistoryType(value: string | undefined): string {
  switch (value) {
    case "1":
      return "buy";
    case "2":
      return "sell";
    case "3":
      return "transfer-in";
    case "4":
      return "transfer-out";
    default:
      return value ?? "";
  }
}

function okxPortfolioChainsCommand() {
  return defineCommand({
    meta: {
      name: "chains",
      description: "List supported OKX Onchain portfolio-analysis chains",
    },
    args: {
      json: { type: "boolean", default: false },
      format: { type: "string", default: "table" },
    },
    async run({ args }) {
      const out = createOutput(resolveOutputOptions(args));
      const client = await createOkxOnchainClientFromConfig();
      const chains = await client.listPortfolioSupportedChains();

      if (args.json || args.format === "json") {
        out.data({ provider: "okx-onchain", chains });
        return;
      }

      out.table(
        chains.map((chain) => ({
          chain: chain.chainIndex,
          name: chain.name ?? "",
        })),
        {
          columns: ["chain", "name"],
          title: "OKX Onchain Portfolio Chains",
        },
      );
    },
  });
}

function okxPortfolioOverviewCommand() {
  return defineCommand({
    meta: {
      name: "overview",
      description: "Get OKX Onchain portfolio PnL overview for one address",
    },
    args: {
      address: {
        type: "positional",
        description: "Wallet address",
        required: true,
      },
      chain: {
        type: "positional",
        description: "Chain name or chainIndex",
        required: true,
      },
      window: {
        type: "string",
        description: "1d, 3d, 7d, 1m, 3m, or codes 1-5 (default: 7d)",
        default: "7d",
      },
      json: { type: "boolean", default: false },
      format: { type: "string", default: "table" },
    },
    async run({ args }) {
      const out = createOutput(resolveOutputOptions(args));
      const client = await createOkxOnchainClientFromConfig();
      const chainIndex = resolveOkxOnchainChainIndex(args.chain);
      const window = resolveOkxOnchainPortfolioWindow(args.window);
      const overview = await client.getPortfolioOverview({
        chainIndex,
        timeFrame: window.timeFrame,
        walletAddress: args.address,
      });

      if (!overview) {
        out.warn(
          `No OKX Onchain portfolio overview found for ${args.address} on ${args.chain}.`,
        );
        return;
      }

      if (args.json || args.format === "json") {
        out.data({
          provider: "okx-onchain",
          address: args.address,
          chain: chainIndex,
          overview,
          timeFrame: window.timeFrame,
          window: window.label,
        });
        return;
      }

      out.table(
        [
          {
            address: args.address,
            chain: formatOkxOnchainChainLabel(chainIndex),
            window: window.label,
            realizedPnl: formatOkxOnchainNumericOrText(
              overview.realizedPnlUsd,
              formatOkxOnchainUsd,
            ),
            top3Pnl: formatOkxOnchainNumericOrText(
              overview.top3PnlTokenSumUsd,
              formatOkxOnchainUsd,
            ),
            top3Share: formatOkxOnchainNumericOrText(
              overview.top3PnlTokenPercent,
              formatOkxOnchainPercent,
            ),
            winRate: overview.winRate ?? "",
            buys: overview.buyTxCount ?? "",
            sells: overview.sellTxCount ?? "",
            avgBuyUsd: formatOkxOnchainNumericOrText(
              overview.avgBuyValueUsd,
              formatOkxOnchainUsd,
            ),
            preferredCap: overview.preferredMarketCap ?? "",
          },
        ],
        {
          columns: [
            "address",
            "chain",
            "window",
            "realizedPnl",
            "top3Pnl",
            "top3Share",
            "winRate",
            "buys",
            "sells",
            "avgBuyUsd",
            "preferredCap",
          ],
          title: "OKX Onchain Portfolio Overview",
        },
      );

      if (overview.topPnlTokenList?.length) {
        out.table(
          overview.topPnlTokenList.map((token) => ({
            symbol: token.tokenSymbol ?? "",
            pnlUsd: formatOkxOnchainNumericOrText(
              token.tokenPnLUsd,
              formatOkxOnchainUsd,
            ),
            pnlPct: formatOkxOnchainNumericOrText(
              token.tokenPnLPercent,
              formatOkxOnchainPercent,
            ),
            token: token.tokenContractAddress ?? "",
          })),
          {
            columns: ["symbol", "pnlUsd", "pnlPct", "token"],
            title: "Top PnL Tokens",
          },
        );
      }

      if (overview.tokenCountByPnlPercent) {
        out.table(
          [
            {
              over500: overview.tokenCountByPnlPercent.over500Percent ?? "",
              zeroTo500: overview.tokenCountByPnlPercent.zeroTo500Percent ?? "",
              zeroToMinus50:
                overview.tokenCountByPnlPercent.zeroToMinus50Percent ?? "",
              belowMinus50:
                overview.tokenCountByPnlPercent.overMinus50Percent ?? "",
            },
          ],
          {
            columns: ["over500", "zeroTo500", "zeroToMinus50", "belowMinus50"],
            title: "PnL Buckets",
          },
        );
      }

      if (overview.buysByMarketCap?.length) {
        out.table(
          overview.buysByMarketCap.map((entry) => ({
            marketCapRange: entry.marketCapRange ?? "",
            buyCount: entry.buyCount ?? "",
          })),
          {
            columns: ["marketCapRange", "buyCount"],
            title: "Buys by Market Cap",
          },
        );
      }
    },
  });
}

function okxPortfolioRecentPnlCommand() {
  return defineCommand({
    meta: {
      name: "recent-pnl",
      description: "Get OKX Onchain recent token PnL list for one address",
    },
    args: {
      address: {
        type: "positional",
        description: "Wallet address",
        required: true,
      },
      chain: {
        type: "positional",
        description: "Chain name or chainIndex",
        required: true,
      },
      cursor: {
        type: "string",
        description: "Pagination cursor returned by the previous query",
      },
      limit: {
        type: "string",
        description: "Rows to request from OKX (max: 100, default: 20)",
        default: "20",
      },
      json: { type: "boolean", default: false },
      format: { type: "string", default: "table" },
    },
    async run({ args }) {
      const out = createOutput(resolveOutputOptions(args));
      const client = await createOkxOnchainClientFromConfig();
      const chainIndex = resolveOkxOnchainChainIndex(args.chain);
      const page = await client.getPortfolioRecentPnl({
        chainIndex,
        cursor: args.cursor,
        limit: args.limit,
        walletAddress: args.address,
      });
      const recentPnl = page.pnlList ?? [];

      if (recentPnl.length === 0) {
        out.warn(
          `No OKX Onchain recent PnL entries found for ${args.address} on ${args.chain}.`,
        );
        return;
      }

      if (args.json || args.format === "json") {
        out.data({
          provider: "okx-onchain",
          address: args.address,
          chain: chainIndex,
          cursor: page.cursor ?? null,
          recentPnl,
        });
        return;
      }

      out.table(
        recentPnl.map((entry) => ({
          symbol: entry.tokenSymbol ?? "",
          lastActive: formatOkxOnchainTimestamp(entry.lastActiveTimestamp),
          totalPnl: formatOkxOnchainNumericOrText(
            entry.totalPnlUsd,
            formatOkxOnchainUsd,
          ),
          totalPct: formatOkxOnchainNumericOrText(
            entry.totalPnlPercent,
            formatOkxOnchainPercent,
          ),
          realized: formatOkxOnchainNumericOrText(
            entry.realizedPnlUsd,
            formatOkxOnchainUsd,
          ),
          unrealized: formatOkxOnchainNumericOrText(
            entry.unrealizedPnlUsd,
            formatOkxOnchainUsd,
          ),
          balanceUsd: formatOkxOnchainNumericOrText(
            entry.tokenBalanceUsd,
            formatOkxOnchainUsd,
          ),
          positionPct: formatOkxOnchainNumericOrText(
            entry.tokenPositionPercent,
            formatOkxOnchainPercent,
          ),
          buyTx: entry.buyTxCount ?? "",
          sellTx: entry.sellTxCount ?? "",
          token: entry.tokenContractAddress,
        })),
        {
          columns: [
            "symbol",
            "lastActive",
            "totalPnl",
            "totalPct",
            "realized",
            "unrealized",
            "balanceUsd",
            "positionPct",
            "buyTx",
            "sellTx",
            "token",
          ],
          title: "OKX Onchain Recent PnL",
        },
      );

      if (page.cursor) {
        out.data(`Next cursor: ${page.cursor}`);
      }
    },
  });
}

function okxPortfolioLatestPnlCommand() {
  return defineCommand({
    meta: {
      name: "latest-pnl",
      description: "Get OKX Onchain latest PnL for one token on one address",
    },
    args: {
      address: {
        type: "positional",
        description: "Wallet address",
        required: true,
      },
      chain: {
        type: "positional",
        description: "Chain name or chainIndex",
        required: true,
      },
      token: {
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
      const tokenContractAddress = normalizeOkxOnchainTokenAddress(args.token);
      const pnl = await client.getPortfolioLatestPnl({
        chainIndex,
        tokenContractAddress,
        walletAddress: args.address,
      });

      if (!pnl) {
        out.warn(
          `No OKX Onchain latest PnL found for ${args.token} on ${args.chain} at ${args.address}.`,
        );
        return;
      }

      if (args.json || args.format === "json") {
        out.data({
          provider: "okx-onchain",
          address: args.address,
          chain: chainIndex,
          pnl,
          token: tokenContractAddress,
        });
        return;
      }

      out.table(
        [
          {
            address: args.address,
            chain: formatOkxOnchainChainLabel(chainIndex),
            token: tokenContractAddress,
            totalPnl: formatOkxOnchainNumericOrText(
              pnl.totalPnlUsd,
              formatOkxOnchainUsd,
            ),
            totalPct: formatOkxOnchainNumericOrText(
              pnl.totalPnlPercent,
              formatOkxOnchainPercent,
            ),
            realized: formatOkxOnchainNumericOrText(
              pnl.realizedPnlUsd,
              formatOkxOnchainUsd,
            ),
            realizedPct: formatOkxOnchainNumericOrText(
              pnl.realizedPnlPercent,
              formatOkxOnchainPercent,
            ),
            unrealized: formatOkxOnchainNumericOrText(
              pnl.unrealizedPnlUsd,
              formatOkxOnchainUsd,
            ),
            unrealizedPct: formatOkxOnchainNumericOrText(
              pnl.unrealizedPnlPercent,
              formatOkxOnchainPercent,
            ),
            supported: pnl.isPnlSupported === false ? "no" : "yes",
          },
        ],
        {
          columns: [
            "address",
            "chain",
            "token",
            "totalPnl",
            "totalPct",
            "realized",
            "realizedPct",
            "unrealized",
            "unrealizedPct",
            "supported",
          ],
          title: "OKX Onchain Latest PnL",
        },
      );
    },
  });
}

function okxPortfolioDexHistoryCommand() {
  return defineCommand({
    meta: {
      name: "dex-history",
      description: "Get OKX Onchain DEX transaction history for one address",
    },
    args: {
      address: {
        type: "positional",
        description: "Wallet address",
        required: true,
      },
      chain: {
        type: "positional",
        description: "Chain name or chainIndex",
        required: true,
      },
      begin: {
        type: "positional",
        description: "Begin timestamp in Unix milliseconds",
        required: true,
      },
      end: {
        type: "positional",
        description: "End timestamp in Unix milliseconds",
        required: true,
      },
      token: {
        type: "string",
        description: "Optional token contract address filter",
      },
      type: {
        type: "string",
        description:
          "Optional type filter: buy, sell, transfer-in, transfer-out, or codes 1-4. Comma-separated values are supported.",
      },
      cursor: {
        type: "string",
        description: "Pagination cursor returned by the previous query",
      },
      limit: {
        type: "string",
        description: "Rows to request from OKX (max: 100, default: 20)",
        default: "20",
      },
      json: { type: "boolean", default: false },
      format: { type: "string", default: "table" },
    },
    async run({ args }) {
      const out = createOutput(resolveOutputOptions(args));
      const client = await createOkxOnchainClientFromConfig();
      const chainIndex = resolveOkxOnchainChainIndex(args.chain);
      const transactions = await client.getPortfolioDexHistory({
        begin: args.begin,
        chainIndex,
        cursor: args.cursor,
        end: args.end,
        limit: args.limit,
        tokenContractAddress: args.token
          ? normalizeOkxOnchainTokenAddress(args.token)
          : undefined,
        type: resolveOkxOnchainPortfolioDexHistoryTypes(args.type),
        walletAddress: args.address,
      });
      const rows = transactions.transactionList ?? [];

      if (rows.length === 0) {
        out.warn(
          `No OKX Onchain DEX history found for ${args.address} on ${args.chain}.`,
        );
        return;
      }

      if (args.json || args.format === "json") {
        out.data({
          address: args.address,
          begin: args.begin,
          chain: chainIndex,
          cursor: transactions.cursor ?? null,
          end: args.end,
          provider: "okx-onchain",
          transactions: rows,
        });
        return;
      }

      out.table(
        rows.map((entry) => ({
          time: formatOkxOnchainTimestamp(entry.time),
          type: formatOkxOnchainDexHistoryType(entry.type),
          symbol: entry.tokenSymbol ?? "",
          amount: formatOkxOnchainAmount(entry.amount),
          price: formatOkxOnchainAmount(entry.price),
          valueUsd: formatOkxOnchainNumericOrText(
            entry.valueUsd,
            formatOkxOnchainUsd,
          ),
          pnlUsd: formatOkxOnchainNumericOrText(
            entry.pnlUsd,
            formatOkxOnchainUsd,
          ),
          marketCap: formatOkxOnchainNumericOrText(
            entry.marketCap,
            formatOkxOnchainUsd,
          ),
          token: entry.tokenContractAddress,
        })),
        {
          columns: [
            "time",
            "type",
            "symbol",
            "amount",
            "price",
            "valueUsd",
            "pnlUsd",
            "marketCap",
            "token",
          ],
          title: "OKX Onchain DEX History",
        },
      );

      if (transactions.cursor) {
        out.data(`Next cursor: ${transactions.cursor}`);
      }
    },
  });
}

function okxPortfolioValueCommand() {
  return defineCommand({
    meta: {
      name: "value",
      description: "Get OKX Onchain portfolio value for an address",
    },
    args: {
      address: {
        type: "positional",
        description: "Wallet address",
        required: true,
      },
      chains: {
        type: "string",
        description:
          "Comma-separated chain names or chainIndex values, e.g. ethereum,base or 1,8453",
        required: true,
      },
      "asset-type": {
        type: "string",
        description: "all, token, or defi (default: all)",
        default: "all",
      },
      "include-risk": {
        type: "boolean",
        description: "Include risk tokens in the valuation query",
        default: false,
      },
      json: { type: "boolean", default: false },
      format: { type: "string", default: "table" },
    },
    async run({ args }) {
      const out = createOutput(resolveOutputOptions(args));
      const client = await createOkxOnchainClientFromConfig();
      const selection = resolveOkxOnchainChainSelection(args.chains);
      const value = await client.getTotalValue({
        address: args.address,
        assetType: resolveAssetType(args["asset-type"]),
        chains: selection.query,
        excludeRiskToken: args["include-risk"] ? false : undefined,
      });

      if (!value) {
        out.warn(`No OKX Onchain value found for ${args.address}.`);
        return;
      }

      if (args.json || args.format === "json") {
        out.data({
          provider: "okx-onchain",
          address: args.address,
          chains: selection.chainIndexes,
          assetType: args["asset-type"],
          totalValue: value.totalValue ?? null,
        });
        return;
      }

      out.table(
        [
          {
            address: args.address,
            chains: selection.chainIndexes.join(","),
            assetType: args["asset-type"],
            totalValue: formatOkxOnchainUsd(value.totalValue),
          },
        ],
        {
          columns: ["address", "chains", "assetType", "totalValue"],
          title: "OKX Onchain Portfolio Value",
        },
      );
    },
  });
}

function okxPortfolioBalancesCommand() {
  return defineCommand({
    meta: {
      name: "balances",
      description: "Get OKX Onchain token balances for an address",
    },
    args: {
      address: {
        type: "positional",
        description: "Wallet address",
        required: true,
      },
      chains: {
        type: "string",
        description:
          "Comma-separated chain names or chainIndex values, e.g. ethereum,base or 1,8453",
        required: true,
      },
      "include-risk": {
        type: "boolean",
        description: "Include risk tokens in the balance query",
        default: false,
      },
      json: { type: "boolean", default: false },
      format: { type: "string", default: "table" },
    },
    async run({ args }) {
      const out = createOutput(resolveOutputOptions(args));
      const client = await createOkxOnchainClientFromConfig();
      const selection = resolveOkxOnchainChainSelection(args.chains);
      const balances = await client.getTokenBalances({
        address: args.address,
        chains: selection.query,
        includeRisk: args["include-risk"],
      });

      if (balances.length === 0) {
        out.warn(`No OKX Onchain balances found for ${args.address}.`);
        return;
      }

      if (args.json || args.format === "json") {
        out.data({
          provider: "okx-onchain",
          address: args.address,
          chains: selection.chainIndexes,
          balances,
        });
        return;
      }

      out.table(
        balances.map((asset) => ({
          chain: formatOkxOnchainChainLabel(asset.chainIndex),
          symbol: asset.symbol ?? "",
          balance: formatOkxOnchainAmount(asset.balance),
          price: formatOkxOnchainUsd(asset.tokenPrice, 8),
          value: estimateOkxOnchainUsdValue(asset),
          risk: asset.isRiskToken ? "yes" : "no",
          token: asset.tokenContractAddress || "native",
        })),
        {
          columns: [
            "chain",
            "symbol",
            "balance",
            "price",
            "value",
            "risk",
            "token",
          ],
          title: "OKX Onchain Balances",
        },
      );
    },
  });
}

function okxPortfolioBalanceCommand() {
  return defineCommand({
    meta: {
      name: "balance",
      description: "Get OKX Onchain balance for one token on one chain",
    },
    args: {
      address: {
        type: "positional",
        description: "Wallet address",
        required: true,
      },
      chain: {
        type: "positional",
        description: "Chain name or chainIndex",
        required: true,
      },
      token: {
        type: "positional",
        description: 'Token address or literal "native"',
        required: true,
      },
      "include-risk": {
        type: "boolean",
        description: "Include risk tokens in the balance query",
        default: false,
      },
      json: { type: "boolean", default: false },
      format: { type: "string", default: "table" },
    },
    async run({ args }) {
      const out = createOutput(resolveOutputOptions(args));
      const client = await createOkxOnchainClientFromConfig();
      const chainIndex = resolveOkxOnchainChainIndex(args.chain);
      const tokenContractAddress = normalizeOkxOnchainTokenAddress(args.token);
      const balances = await client.getSpecificTokenBalances({
        address: args.address,
        includeRisk: args["include-risk"],
        tokens: [{ chainIndex, tokenContractAddress }],
      });
      const balance = balances[0];

      if (!balance) {
        out.warn(
          `No OKX Onchain balance found for ${args.token} on ${args.chain} at ${args.address}.`,
        );
        return;
      }

      if (args.json || args.format === "json") {
        out.data({
          provider: "okx-onchain",
          address: args.address,
          balance,
        });
        return;
      }

      out.table(
        [
          {
            chain: formatOkxOnchainChainLabel(balance.chainIndex),
            symbol: balance.symbol ?? "",
            balance: formatOkxOnchainAmount(balance.balance),
            price: formatOkxOnchainUsd(balance.tokenPrice, 8),
            value: estimateOkxOnchainUsdValue(balance),
            risk: balance.isRiskToken ? "yes" : "no",
            token: balance.tokenContractAddress || "native",
          },
        ],
        {
          columns: [
            "chain",
            "symbol",
            "balance",
            "price",
            "value",
            "risk",
            "token",
          ],
          title: "OKX Onchain Balance",
        },
      );
    },
  });
}

export default defineCommand({
  meta: { name: "okx", description: "OKX Onchain portfolio data" },
  subCommands: {
    chains: okxPortfolioChainsCommand,
    overview: okxPortfolioOverviewCommand,
    "recent-pnl": okxPortfolioRecentPnlCommand,
    "latest-pnl": okxPortfolioLatestPnlCommand,
    "dex-history": okxPortfolioDexHistoryCommand,
    value: okxPortfolioValueCommand,
    balances: okxPortfolioBalancesCommand,
    balance: okxPortfolioBalanceCommand,
  },
});
