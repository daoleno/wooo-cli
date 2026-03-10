import ansis from "ansis";
import { defineCommand } from "citty";
import { loadWoooConfig } from "../../core/config";
import { getActivePrivateKey } from "../../core/context";
import { createOutput, resolveOutputOptions } from "../../core/output";
import type { ProtocolDefinition } from "../types";
import { UniswapClient } from "./client";

const swap = defineCommand({
  meta: { name: "swap", description: "Swap tokens via Uniswap V3" },
  args: {
    tokenIn: {
      type: "positional",
      description: "Token to sell (e.g. ETH, USDC)",
      required: true,
    },
    tokenOut: {
      type: "positional",
      description: "Token to buy (e.g. USDC, ETH)",
      required: true,
    },
    amount: {
      type: "positional",
      description: "Amount of tokenIn to swap",
      required: true,
    },
    chain: {
      type: "string",
      description: "Chain (default: ethereum)",
      default: "ethereum",
    },
    yes: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));
    const amount = Number.parseFloat(args.amount);
    const chain = args.chain;

    const client = new UniswapClient(chain);
    const quote = await client.quote(args.tokenIn, args.tokenOut, amount);

    if (args["dry-run"]) {
      out.data({
        action: "SWAP",
        ...quote,
        chain,
        status: "dry-run",
      });
      return;
    }

    if (!args.yes) {
      console.error(
        ansis.yellow(
          `⚠ Swap ${amount} ${args.tokenIn} → ${quote.amountOut} ${args.tokenOut} on ${chain}. Use --yes to confirm.`,
        ),
      );
      process.exit(6);
    }

    const privateKey = await getActivePrivateKey();
    const authClient = new UniswapClient(chain, privateKey);
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
    chain: {
      type: "string",
      description: "Chain (default: ethereum)",
      default: "ethereum",
    },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));
    const amount = Number.parseFloat(args.amount);

    const client = new UniswapClient(args.chain);
    const result = await client.quote(args.tokenIn, args.tokenOut, amount);
    out.data(result);
  },
});

const tokens = defineCommand({
  meta: { name: "tokens", description: "List supported tokens on a chain" },
  args: {
    chain: {
      type: "string",
      description: "Chain (default: ethereum)",
      default: "ethereum",
    },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));
    const client = new UniswapClient(args.chain);
    const list = await client.tokens();
    out.data({ chain: args.chain, tokens: list });
  },
});

export const uniswapProtocol: ProtocolDefinition = {
  name: "uniswap",
  displayName: "Uniswap V3",
  type: "dex",
  chains: ["ethereum", "arbitrum", "optimism", "polygon", "base"],
  requiresAuth: false,
  setup: () =>
    defineCommand({
      meta: { name: "uniswap", description: "Uniswap V3 DEX" },
      subCommands: {
        swap: () => Promise.resolve(swap),
        quote: () => Promise.resolve(quote),
        tokens: () => Promise.resolve(tokens),
      },
    }),
};
