import { defineCommand } from "citty";
import { createOutput, resolveOutputOptions } from "../../core/output";
import {
  createOkxOnchainClientFromConfig,
  normalizeOkxOnchainTokenAddress,
  resolveOkxOnchainChainIndex,
  resolveOkxOnchainChainSelection,
} from "../../services/okx-onchain/client";
import {
  formatOkxOnchainChainLabel,
  formatOkxOnchainPercent,
  formatOkxOnchainTimestamp,
  formatOkxOnchainUsd,
} from "../../services/okx-onchain/presentation";

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

export default defineCommand({
  meta: { name: "okx", description: "OKX Onchain market data" },
  subCommands: {
    chains: okxMarketChainsCommand,
    search: okxMarketSearchCommand,
    token: okxMarketTokenCommand,
    metrics: okxMarketMetricsCommand,
    price: okxMarketPriceCommand,
  },
});
