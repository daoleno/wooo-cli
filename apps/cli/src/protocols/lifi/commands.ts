import { defineCommand } from "citty";
import {
  evmChainArg,
  isEvmChain,
  normalizeChainName,
} from "../../core/chain-ids";
import { getActiveWallet } from "../../core/context";
import { createOutput, resolveOutputOptions } from "../../core/output";
import { validateAmount } from "../../core/validation";
import { runWriteOperation } from "../../core/write-operation";
import {
  normalizeBridgeTokenInput,
  toBaseUnits,
} from "../bridge/token-resolution";
import type { ProtocolDefinition } from "../types";
import { LifiClient } from "./client";
import { createLifiBridgeOperation, getEvmChainNumber } from "./operations";

function validateEvmBridgeChain(value: string, _label: string): string {
  const chain = normalizeChainName(value);
  if (!isEvmChain(chain)) {
    console.error(
      `Error: Only EVM chains are supported for bridging in this version. Got: ${value}`,
    );
    process.exit(1);
  }
  return chain;
}

const bridge = defineCommand({
  meta: { name: "bridge", description: "Bridge tokens cross-chain via LI.FI" },
  args: {
    token: {
      type: "positional",
      description: "Token to bridge (e.g. USDC, ETH)",
      required: true,
    },
    to: {
      type: "string",
      description: "Destination token (defaults to same as source)",
      required: false,
    },
    amount: {
      type: "positional",
      description: "Amount to bridge",
      required: true,
    },
    "from-chain": evmChainArg("ethereum"),
    "to-chain": {
      type: "string",
      description: "Destination chain",
      required: true,
    },
    yes: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const fromToken = normalizeBridgeTokenInput(args.token);
    const toToken = args.to ? normalizeBridgeTokenInput(args.to) : fromToken;
    const amount = validateAmount(args.amount, "Bridge amount");
    const fromChain = validateEvmBridgeChain(
      args["from-chain"],
      "Source chain",
    );
    const toChain = validateEvmBridgeChain(
      args["to-chain"],
      "Destination chain",
    );

    await runWriteOperation(
      args,
      createLifiBridgeOperation({
        fromChain,
        toChain,
        fromToken,
        toToken,
        amount,
      }),
      {
        formatResult: (result) => ({
          ...result,
          message: `Bridge submitted. Track status: wooo bridge lifi status ${result.txHash} --from-chain ${fromChain} --to-chain ${toChain}`,
        }),
      },
    );
  },
});

const quote = defineCommand({
  meta: {
    name: "quote",
    description: "Get a bridge quote without executing",
  },
  args: {
    token: {
      type: "positional",
      description: "Token to bridge",
      required: true,
    },
    to: {
      type: "string",
      description: "Destination token",
      required: false,
    },
    amount: {
      type: "positional",
      description: "Amount to bridge",
      required: true,
    },
    "from-chain": evmChainArg("ethereum"),
    "to-chain": {
      type: "string",
      description: "Destination chain",
      required: true,
    },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));
    const fromToken = normalizeBridgeTokenInput(args.token);
    const toToken = args.to ? normalizeBridgeTokenInput(args.to) : fromToken;
    const amount = validateAmount(args.amount, "Quote amount");
    const fromChain = validateEvmBridgeChain(
      args["from-chain"],
      "Source chain",
    );
    const toChain = validateEvmBridgeChain(
      args["to-chain"],
      "Destination chain",
    );

    const wallet = await getActiveWallet("evm");
    const client = new LifiClient();

    const fromTokenMeta = await client.resolveToken(
      fromChain,
      getEvmChainNumber(fromChain),
      fromToken,
    );
    const toTokenMeta = await client.resolveToken(
      toChain,
      getEvmChainNumber(toChain),
      toToken,
    );
    const result = await client.getQuote({
      fromChain: getEvmChainNumber(fromChain),
      toChain: getEvmChainNumber(toChain),
      fromToken: fromTokenMeta.address,
      toToken: toTokenMeta.address,
      fromAmount: toBaseUnits(amount, fromTokenMeta.decimals),
      fromAddress: wallet.address,
    });
    out.data(result);
  },
});

const status = defineCommand({
  meta: {
    name: "status",
    description: "Check bridge transaction status",
  },
  args: {
    txHash: {
      type: "positional",
      description: "Transaction hash to check",
      required: true,
    },
    "from-chain": evmChainArg("ethereum"),
    "to-chain": {
      type: "string",
      description: "Destination chain",
      required: true,
    },
    bridge: {
      type: "string",
      description: "Bridge name (optional)",
      required: false,
    },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));
    const fromChain = validateEvmBridgeChain(
      args["from-chain"],
      "Source chain",
    );
    const toChain = validateEvmBridgeChain(
      args["to-chain"],
      "Destination chain",
    );

    const client = new LifiClient();
    const result = await client.getStatus(
      args.txHash,
      args.bridge ?? undefined,
      getEvmChainNumber(fromChain),
      getEvmChainNumber(toChain),
    );
    out.data(result);
  },
});

const chains = defineCommand({
  meta: { name: "chains", description: "List supported chains" },
  args: {
    tokens: {
      type: "boolean",
      description: "Include supported tokens",
      default: false,
    },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));
    const client = new LifiClient();
    const chainList = await client.getChains(["EVM"]);

    if (args.tokens) {
      const chainIds = chainList.map((c) => c.id);
      const tokens = await client.getTokens(chainIds);
      out.data({ chains: chainList, tokens });
    } else {
      out.data({ chains: chainList });
    }
  },
});

export const lifiProtocol: ProtocolDefinition = {
  name: "lifi",
  displayName: "LI.FI Bridge Aggregator",
  type: "bridge",
  writeAccountType: "evm",
  setup: () =>
    defineCommand({
      meta: { name: "lifi", description: "LI.FI Bridge Aggregator" },
      subCommands: {
        bridge: () => Promise.resolve(bridge),
        quote: () => Promise.resolve(quote),
        status: () => Promise.resolve(status),
        chains: () => Promise.resolve(chains),
      },
    }),
};
