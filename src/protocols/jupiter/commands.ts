import { defineCommand } from "citty";
import { confirmTransaction } from "../../core/confirm";
import { getActivePrivateKey } from "../../core/context";
import { createOutput, resolveOutputOptions } from "../../core/output";
import { validateAmount, validateTokenSymbol } from "../../core/validation";
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
    const tokenIn = validateTokenSymbol(args.tokenIn);
    const tokenOut = validateTokenSymbol(args.tokenOut);
    const amount = validateAmount(args.amount, "Swap amount");

    const client = new JupiterClient();
    const quoteResult = await client.quote(tokenIn, tokenOut, amount);

    const confirmed = await confirmTransaction(
      {
        action: `Swap ${amount} ${tokenIn} → ${quoteResult.outAmount} ${tokenOut} via Jupiter (Solana)`,
        details: {
          tokenIn,
          tokenOut,
          amountIn: amount,
          amountOut: quoteResult.outAmount,
          priceImpact: quoteResult.priceImpact,
          chain: "solana",
          protocol: "Jupiter",
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
          amountOut: quoteResult.outAmount,
          priceImpact: quoteResult.priceImpact,
          route: quoteResult.routePlan,
          chain: "solana",
          protocol: "Jupiter",
          status: "dry-run",
        });
      }
      return;
    }

    const privateKey = await getActivePrivateKey("solana");
    const authClient = new JupiterClient(privateKey);
    const result = await authClient.swap(tokenIn, tokenOut, amount);
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
    const tokenIn = validateTokenSymbol(args.tokenIn);
    const tokenOut = validateTokenSymbol(args.tokenOut);
    const amount = validateAmount(args.amount, "Quote amount");

    const client = new JupiterClient();
    const result = await client.quote(tokenIn, tokenOut, amount);
    out.data({
      tokenIn,
      tokenOut,
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
