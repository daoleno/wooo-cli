import { defineCommand } from "citty";
import { evmChainArg } from "../../core/chain-ids";
import { createOutput, resolveOutputOptions } from "../../core/output";
import {
  validateAmount,
  validateChain,
  validateTokenSymbol,
} from "../../core/validation";
import { runWriteOperation } from "../../core/write-operation";
import type { ProtocolDefinition } from "../types";
import { CurveClient } from "./client";
import { createCurveSwapOperation } from "./operations";

const SUPPORTED_CHAINS = [
  "ethereum",
  "arbitrum",
  "optimism",
  "polygon",
  "base",
];

const swap = defineCommand({
  meta: {
    name: "swap",
    description: "Swap tokens via Curve (optimized for stablecoins)",
  },
  args: {
    tokenIn: {
      type: "positional",
      description: "Token to sell (e.g. USDT, DAI)",
      required: true,
    },
    tokenOut: {
      type: "positional",
      description: "Token to buy (e.g. USDC)",
      required: true,
    },
    amount: {
      type: "positional",
      description: "Amount of tokenIn to swap",
      required: true,
    },
    chain: evmChainArg(),
    yes: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const tokenIn = validateTokenSymbol(args.tokenIn);
    const tokenOut = validateTokenSymbol(args.tokenOut);
    const amount = validateAmount(args.amount, "Swap amount");
    const chain = validateChain(args.chain, SUPPORTED_CHAINS);
    await runWriteOperation(
      args,
      createCurveSwapOperation({
        tokenIn,
        tokenOut,
        amount,
        chain,
      }),
    );
  },
});

const pools = defineCommand({
  meta: { name: "pools", description: "List available Curve pools" },
  args: {
    chain: evmChainArg(),
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const outputOptions = resolveOutputOptions(args);
    const out = createOutput(outputOptions);
    const chain = validateChain(args.chain, SUPPORTED_CHAINS);
    const client = new CurveClient(chain);
    const list = await client.pools();

    if (outputOptions.json || outputOptions.format === "json") {
      out.data({ chain, pools: list });
      return;
    }

    out.table(
      list.map((p) => ({
        name: p.name,
        address: `${p.address.slice(0, 6)}...${p.address.slice(-4)}`,
        tokens: p.tokens.join("/"),
      })),
      {
        columns: ["name", "address", "tokens"],
        title: "Curve Pools",
      },
    );
  },
});

const quote = defineCommand({
  meta: { name: "quote", description: "Get a swap quote without executing" },
  args: {
    tokenIn: {
      type: "positional",
      description: "Token to sell",
      required: true,
    },
    tokenOut: {
      type: "positional",
      description: "Token to buy",
      required: true,
    },
    amount: {
      type: "positional",
      description: "Amount of tokenIn",
      required: true,
    },
    chain: evmChainArg(),
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));
    const tokenIn = validateTokenSymbol(args.tokenIn);
    const tokenOut = validateTokenSymbol(args.tokenOut);
    const amount = validateAmount(args.amount, "Quote amount");
    const chain = validateChain(args.chain, SUPPORTED_CHAINS);

    const client = new CurveClient(chain);
    const result = await client.quote(tokenIn, tokenOut, amount);
    out.data({
      tokenIn,
      tokenOut,
      amountIn: amount,
      ...result,
    });
  },
});

export const curveProtocol: ProtocolDefinition = {
  name: "curve",
  displayName: "Curve Finance",
  type: "dex",
  chains: ["ethereum", "arbitrum", "optimism", "polygon", "base"],
  writeAccountType: "evm",
  setup: () =>
    defineCommand({
      meta: { name: "curve", description: "Curve stableswap DEX" },
      subCommands: {
        swap: () => Promise.resolve(swap),
        quote: () => Promise.resolve(quote),
        pools: () => Promise.resolve(pools),
      },
    }),
};
