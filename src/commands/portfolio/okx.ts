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
  formatOkxOnchainUsd,
} from "../../services/okx-onchain/presentation";

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

function okxPortfolioChainsCommand() {
  return defineCommand({
    meta: {
      name: "chains",
      description: "List supported OKX Onchain portfolio chains",
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
          title: "OKX Onchain Portfolio Chains",
        },
      );
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
    value: okxPortfolioValueCommand,
    balances: okxPortfolioBalancesCommand,
    balance: okxPortfolioBalanceCommand,
  },
});
