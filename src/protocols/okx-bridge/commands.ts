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
import { OkxBridgeClient } from "./client";
import { createOkxBridgeOperation, getOkxChainId } from "./operations";

function validateEvmBridgeChain(value: string): string {
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
  meta: {
    name: "bridge",
    description: "Bridge tokens cross-chain via OKX",
  },
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
    const fromChain = validateEvmBridgeChain(args["from-chain"]);
    const toChain = validateEvmBridgeChain(args["to-chain"]);

    await runWriteOperation(
      args,
      createOkxBridgeOperation({
        fromChain,
        toChain,
        fromToken,
        toToken,
        amount,
      }),
      {
        formatResult: (result) => ({
          ...result,
          message: `Bridge submitted. Track status: wooo bridge okx status ${result.txHash}`,
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
    const fromChain = validateEvmBridgeChain(args["from-chain"]);
    const toChain = validateEvmBridgeChain(args["to-chain"]);

    const wallet = await getActiveWallet("evm");

    const client = new OkxBridgeClient();
    const fromTokenMeta = await client.resolveToken(
      fromChain,
      getOkxChainId(fromChain),
      fromToken,
    );
    const toTokenMeta = await client.resolveToken(
      toChain,
      getOkxChainId(toChain),
      toToken,
    );
    const result = await client.getQuote({
      fromChainId: getOkxChainId(fromChain),
      toChainId: getOkxChainId(toChain),
      fromTokenAddress: fromTokenMeta.address,
      toTokenAddress: toTokenMeta.address,
      amount: toBaseUnits(amount, fromTokenMeta.decimals),
      userWalletAddress: wallet.address,
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
      description: "Transaction hash",
      required: true,
    },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));
    const client = new OkxBridgeClient();
    const result = await client.getStatus(args.txHash);
    out.data(result);
  },
});

const chains = defineCommand({
  meta: {
    name: "chains",
    description: "List supported chains and tokens",
  },
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
    const client = new OkxBridgeClient();
    const chainList = await client.getSupportedChains();

    if (args.tokens) {
      const tokenList = await client.getSupportedTokens();
      out.data({ chains: chainList, tokens: tokenList });
    } else {
      out.data({ chains: chainList });
    }
  },
});

export const okxBridgeProtocol: ProtocolDefinition = {
  name: "okx",
  displayName: "OKX Cross-Chain Bridge",
  type: "bridge",
  writeAccountType: "evm",
  setup: () =>
    defineCommand({
      meta: { name: "okx", description: "OKX Cross-Chain Bridge" },
      subCommands: {
        bridge: () => Promise.resolve(bridge),
        quote: () => Promise.resolve(quote),
        status: () => Promise.resolve(status),
        chains: () => Promise.resolve(chains),
      },
    }),
};
