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
import { UniswapClient } from "./client";

const SUPPORTED_CHAINS = [
  "ethereum",
  "arbitrum",
  "optimism",
  "polygon",
  "base",
];

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
    const tokenIn = validateTokenSymbol(args.tokenIn);
    const tokenOut = validateTokenSymbol(args.tokenOut);
    const amount = validateAmount(args.amount, "Swap amount");
    const chain = validateChain(args.chain, SUPPORTED_CHAINS);

    const client = new UniswapClient(chain);
    const quoteResult = await client.quote(tokenIn, tokenOut, amount);

    const confirmed = await confirmTransaction(
      {
        action: `Swap ${amount} ${tokenIn} → ${quoteResult.amountOut} ${tokenOut} on Uniswap (${chain})`,
        details: { ...quoteResult, chain, protocol: "Uniswap V3" },
      },
      args,
    );

    if (!confirmed) {
      if (args["dry-run"]) {
        out.data({ action: "SWAP", ...quoteResult, chain, status: "dry-run" });
      }
      return;
    }

    const privateKey = await getActivePrivateKey("evm");
    const authClient = new UniswapClient(chain, privateKey);
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
    const tokenIn = validateTokenSymbol(args.tokenIn);
    const tokenOut = validateTokenSymbol(args.tokenOut);
    const amount = validateAmount(args.amount, "Quote amount");
    const chain = validateChain(args.chain, SUPPORTED_CHAINS);

    const client = new UniswapClient(chain);
    const result = await client.quote(tokenIn, tokenOut, amount);
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
