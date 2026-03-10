import ansis from "ansis";
import { defineCommand } from "citty";
import { getActivePrivateKey } from "../../core/context";
import { createOutput, resolveOutputOptions } from "../../core/output";
import type { ProtocolDefinition } from "../types";
import { JupiterClient } from "./client";

const swap = defineCommand({
  meta: { name: "swap", description: "Swap tokens on Solana via Jupiter" },
  args: {
    tokenIn: {
      type: "positional",
      description: "Token to sell (e.g. SOL, USDC)",
      required: true,
    },
    tokenOut: {
      type: "positional",
      description: "Token to buy (e.g. USDC, SOL)",
      required: true,
    },
    amount: {
      type: "positional",
      description: "Amount of tokenIn to swap",
      required: true,
    },
    yes: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));
    const amount = Number.parseFloat(args.amount);

    const client = new JupiterClient();
    const quoteResult = await client.quote(args.tokenIn, args.tokenOut, amount);

    if (args["dry-run"]) {
      out.data({
        action: "SWAP",
        tokenIn: args.tokenIn.toUpperCase(),
        tokenOut: args.tokenOut.toUpperCase(),
        amountIn: amount,
        amountOut: quoteResult.outAmount,
        priceImpact: quoteResult.priceImpact,
        route: quoteResult.routePlan,
        chain: "solana",
        protocol: "Jupiter",
        status: "dry-run",
      });
      return;
    }

    if (!args.yes) {
      console.error(
        ansis.yellow(
          `⚠ Swap ${amount} ${args.tokenIn} → ${quoteResult.outAmount} ${args.tokenOut} via Jupiter. Use --yes to confirm.`,
        ),
      );
      process.exit(6);
    }

    const privateKey = await getActivePrivateKey();
    const authClient = new JupiterClient(privateKey);
    const result = await authClient.swap(args.tokenIn, args.tokenOut, amount);
    out.data(result);
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
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));
    const amount = Number.parseFloat(args.amount);
    const client = new JupiterClient();
    const result = await client.quote(args.tokenIn, args.tokenOut, amount);
    out.data({
      tokenIn: args.tokenIn.toUpperCase(),
      tokenOut: args.tokenOut.toUpperCase(),
      amountIn: amount,
      ...result,
    });
  },
});

const tokens = defineCommand({
  meta: { name: "tokens", description: "List supported Solana tokens" },
  args: {
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));
    const client = new JupiterClient();
    out.data({ chain: "solana", tokens: client.tokens() });
  },
});

export const jupiterProtocol: ProtocolDefinition = {
  name: "jupiter",
  displayName: "Jupiter",
  type: "dex",
  chains: ["solana"],
  requiresAuth: false,
  setup: () =>
    defineCommand({
      meta: { name: "jupiter", description: "Jupiter Solana DEX aggregator" },
      subCommands: {
        swap: () => Promise.resolve(swap),
        quote: () => Promise.resolve(quote),
        tokens: () => Promise.resolve(tokens),
      },
    }),
};
