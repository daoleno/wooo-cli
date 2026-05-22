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
  formatOkxOnchainTimestamp,
  summarizeOkxOnchainAddresses,
} from "../../services/okx-onchain/presentation";

function okxChainChainsCommand() {
  return defineCommand({
    meta: {
      name: "chains",
      description: "List supported OKX Onchain history chains",
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
          title: "OKX Onchain History Chains",
        },
      );
    },
  });
}

function okxChainHistoryCommand() {
  return defineCommand({
    meta: {
      name: "history",
      description: "Get OKX Onchain transaction history for an address",
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
      token: {
        type: "string",
        description:
          'Optional token address filter. Use "native" for the native asset only.',
      },
      begin: {
        type: "string",
        description: "Optional begin timestamp in Unix milliseconds",
      },
      end: {
        type: "string",
        description: "Optional end timestamp in Unix milliseconds",
      },
      cursor: {
        type: "string",
        description: "Pagination cursor returned by the previous query",
      },
      limit: {
        type: "string",
        description:
          "Rows to request from OKX (single chain up to 100, multi-chain up to 20)",
      },
      json: { type: "boolean", default: false },
      format: { type: "string", default: "table" },
    },
    async run({ args }) {
      const out = createOutput(resolveOutputOptions(args));
      const client = await createOkxOnchainClientFromConfig();
      const selection = resolveOkxOnchainChainSelection(args.chains);
      const history = await client.getTransactionHistory({
        address: args.address,
        begin: args.begin,
        chains: selection.query,
        cursor: args.cursor,
        end: args.end,
        limit: args.limit,
        tokenContractAddress: args.token
          ? normalizeOkxOnchainTokenAddress(args.token)
          : undefined,
      });

      if (history.transactions.length === 0) {
        out.warn(`No OKX Onchain transactions found for ${args.address}.`);
        return;
      }

      if (args.json || args.format === "json") {
        out.data({
          provider: "okx-onchain",
          address: args.address,
          chains: selection.chainIndexes,
          cursor: history.cursor ?? null,
          transactions: history.transactions,
        });
        return;
      }

      out.table(
        history.transactions.map((tx) => ({
          chain: formatOkxOnchainChainLabel(tx.chainIndex),
          time: formatOkxOnchainTimestamp(tx.txTime),
          status: tx.txStatus ?? "",
          symbol: tx.symbol ?? "",
          amount: formatOkxOnchainAmount(tx.amount),
          from: summarizeOkxOnchainAddresses(tx.from),
          to: summarizeOkxOnchainAddresses(tx.to),
          hash: tx.txHash ?? "",
        })),
        {
          columns: [
            "chain",
            "time",
            "status",
            "symbol",
            "amount",
            "from",
            "to",
            "hash",
          ],
          title: "OKX Onchain Transaction History",
        },
      );

      if (history.cursor) {
        out.data(`Next cursor: ${history.cursor}`);
      }
    },
  });
}

function okxChainTxCommand() {
  return defineCommand({
    meta: {
      name: "tx",
      description: "Get OKX Onchain transaction details by hash",
    },
    args: {
      chain: {
        type: "positional",
        description: "Chain name or chainIndex",
        required: true,
      },
      txhash: {
        type: "positional",
        description: "Transaction hash",
        required: true,
      },
      itype: {
        type: "string",
        description:
          "Optional transaction layer type: 0 outer native, 1 internal native, 2 token transfer",
      },
      json: { type: "boolean", default: false },
      format: { type: "string", default: "table" },
    },
    async run({ args }) {
      const out = createOutput(resolveOutputOptions(args));
      const client = await createOkxOnchainClientFromConfig();
      const chainIndex = resolveOkxOnchainChainIndex(args.chain);
      const tx = await client.getTransactionDetail({
        chainIndex,
        itype: args.itype,
        txHash: args.txhash,
      });

      if (!tx) {
        out.warn(`No OKX Onchain transaction found for ${args.txhash}.`);
        return;
      }

      if (args.json || args.format === "json") {
        out.data({
          provider: "okx-onchain",
          chain: chainIndex,
          transaction: tx,
        });
        return;
      }

      out.table(
        [
          {
            chain: formatOkxOnchainChainLabel(tx.chainIndex),
            status: tx.txStatus ?? "",
            time: formatOkxOnchainTimestamp(tx.txTime),
            symbol: tx.symbol ?? "",
            amount: formatOkxOnchainAmount(tx.amount),
            fee: tx.txFee ?? "",
            height: tx.height ?? "",
            method: tx.methodId ?? "",
            from: summarizeOkxOnchainAddresses(tx.fromDetails),
            to: summarizeOkxOnchainAddresses(tx.toDetails),
            hash: tx.txhash ?? args.txhash,
          },
        ],
        {
          columns: [
            "chain",
            "status",
            "time",
            "symbol",
            "amount",
            "fee",
            "height",
            "method",
            "from",
            "to",
            "hash",
          ],
          title: "OKX Onchain Transaction",
        },
      );
    },
  });
}

export default defineCommand({
  meta: { name: "okx", description: "OKX Onchain chain and history data" },
  subCommands: {
    chains: okxChainChainsCommand,
    history: okxChainHistoryCommand,
    tx: okxChainTxCommand,
  },
});
