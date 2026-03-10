import ansis from "ansis";
import { defineCommand } from "citty";
import { getActivePrivateKey } from "../../core/context";
import { createOutput, resolveOutputOptions } from "../../core/output";
import type { ProtocolDefinition } from "../types";
import { CurveClient } from "./client";

const swap = defineCommand({
  meta: { name: "swap", description: "Swap tokens via Curve (optimized for stablecoins)" },
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
    const amount = Number.parseFloat(args.amount);

    const client = new CurveClient(args.chain);
    const quoteResult = await client.quote(args.tokenIn, args.tokenOut, amount);

    if (args["dry-run"]) {
      out.data({
        action: "SWAP",
        tokenIn: args.tokenIn,
        tokenOut: args.tokenOut,
        amountIn: amount,
        amountOut: quoteResult.amountOut,
        pool: quoteResult.pool,
        chain: args.chain,
        protocol: "Curve",
        status: "dry-run",
      });
      return;
    }

    if (!args.yes) {
      console.error(
        ansis.yellow(
          `⚠ Swap ${amount} ${args.tokenIn} → ${quoteResult.amountOut} ${args.tokenOut} via ${quoteResult.pool}. Use --yes to confirm.`,
        ),
      );
      process.exit(6);
    }

    const privateKey = await getActivePrivateKey();
    const authClient = new CurveClient(args.chain, privateKey);
    const result = await authClient.swap(args.tokenIn, args.tokenOut, amount);
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
    const client = new CurveClient(args.chain);
    const list = client.pools();

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
    const amount = Number.parseFloat(args.amount);
    const client = new CurveClient(args.chain);
    const result = await client.quote(args.tokenIn, args.tokenOut, amount);
    out.data({
      tokenIn: args.tokenIn.toUpperCase(),
      tokenOut: args.tokenOut.toUpperCase(),
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
