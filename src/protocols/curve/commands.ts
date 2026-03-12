import { defineCommand } from "citty";
import { confirmTransaction } from "../../core/confirm";
import { getActivePrivateKey } from "../../core/context";
import { createOutput, resolveOutputOptions } from "../../core/output";
import {
  validateAmount,
  validateChain,
  validateTokenSymbol,
} from "../../core/validation";
import type { ProtocolDefinition } from "../types";
import { CurveClient } from "./client";

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
    chain: { type: "string", default: "ethereum" },
    yes: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));
    const tokenIn = validateTokenSymbol(args.tokenIn);
    const tokenOut = validateTokenSymbol(args.tokenOut);
    const amount = validateAmount(args.amount, "Swap amount");
    const chain = validateChain(args.chain, SUPPORTED_CHAINS);

    const client = new CurveClient(chain);
    const quoteResult = await client.quote(tokenIn, tokenOut, amount);

    const confirmed = await confirmTransaction(
      {
        action: `Swap ${amount} ${tokenIn} → ${quoteResult.amountOut} ${tokenOut} via Curve (${chain})`,
        details: {
          tokenIn,
          tokenOut,
          amountIn: amount,
          amountOut: quoteResult.amountOut,
          pool: quoteResult.pool,
          chain,
          protocol: "Curve",
        },
      },
      args,
    );

    if (!confirmed) {
      if (args["dry-run"]) {
        out.data({
          action: "SWAP",
          tokenIn,
          tokenOut,
          amountIn: amount,
          amountOut: quoteResult.amountOut,
          pool: quoteResult.pool,
          chain,
          protocol: "Curve",
          status: "dry-run",
        });
      }
      return;
    }

    const privateKey = await getActivePrivateKey("evm");
    const authClient = new CurveClient(chain, privateKey);
    const result = await authClient.swap(tokenIn, tokenOut, amount);
    out.data(result);
  },
});

const pools = defineCommand({
  meta: { name: "pools", description: "List available Curve pools" },
  args: {
    chain: { type: "string", default: "ethereum" },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));
    const chain = validateChain(args.chain, SUPPORTED_CHAINS);
    const client = new CurveClient(chain);
    const list = await client.pools();

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
    chain: { type: "string", default: "ethereum" },
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
  requiresAuth: false,
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
