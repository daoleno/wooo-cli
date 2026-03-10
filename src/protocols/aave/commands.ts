import ansis from "ansis";
import { defineCommand } from "citty";
import { getActivePrivateKey } from "../../core/context";
import { createOutput, resolveOutputOptions } from "../../core/output";
import type { ProtocolDefinition } from "../types";
import { AaveClient } from "./client";

const supply = defineCommand({
  meta: { name: "supply", description: "Supply tokens to Aave" },
  args: {
    token: {
      type: "positional",
      description: "Token to supply (e.g. USDC, WETH)",
      required: true,
    },
    amount: {
      type: "positional",
      description: "Amount to supply",
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

    if (args["dry-run"]) {
      out.data({
        action: "SUPPLY",
        token: args.token,
        amount,
        chain: args.chain,
        protocol: "Aave V3",
        status: "dry-run",
      });
      return;
    }

    if (!args.yes) {
      console.error(
        ansis.yellow(
          `⚠ About to supply ${amount} ${args.token} to Aave on ${args.chain}. Use --yes to confirm.`,
        ),
      );
      process.exit(6);
    }

    const privateKey = await getActivePrivateKey();
    const client = new AaveClient(args.chain, privateKey);
    const result = await client.supply(args.token, amount);
    out.data(result);
  },
});

const borrow = defineCommand({
  meta: { name: "borrow", description: "Borrow tokens from Aave" },
  args: {
    token: {
      type: "positional",
      description: "Token to borrow (e.g. USDC, ETH)",
      required: true,
    },
    amount: {
      type: "positional",
      description: "Amount to borrow",
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

    if (args["dry-run"]) {
      out.data({
        action: "BORROW",
        token: args.token,
        amount,
        chain: args.chain,
        protocol: "Aave V3",
        interestRateMode: "variable",
        status: "dry-run",
      });
      return;
    }

    if (!args.yes) {
      console.error(
        ansis.yellow(
          `⚠ About to borrow ${amount} ${args.token} from Aave on ${args.chain}. Use --yes to confirm.`,
        ),
      );
      process.exit(6);
    }

    const privateKey = await getActivePrivateKey();
    const client = new AaveClient(args.chain, privateKey);
    const result = await client.borrow(args.token, amount);
    out.data(result);
  },
});

const positions = defineCommand({
  meta: { name: "positions", description: "View Aave account positions" },
  args: {
    chain: { type: "string", default: "ethereum" },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));
    const privateKey = await getActivePrivateKey();
    const client = new AaveClient(args.chain, privateKey);
    const result = await client.positions();
    out.data(result);
  },
});

const rates = defineCommand({
  meta: { name: "rates", description: "View Aave lending/borrowing rates" },
  args: {
    token: {
      type: "positional",
      description: "Token to check rates for (e.g. USDC, WETH)",
      required: true,
    },
    chain: { type: "string", default: "ethereum" },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));
    const client = new AaveClient(args.chain);
    const result = await client.rates(args.token);
    out.data(result);
  },
});

export const aaveProtocol: ProtocolDefinition = {
  name: "aave",
  displayName: "Aave V3",
  type: "lending",
  chains: ["ethereum", "arbitrum", "optimism", "polygon", "base"],
  requiresAuth: false,
  setup: () =>
    defineCommand({
      meta: { name: "aave", description: "Aave V3 lending protocol" },
      subCommands: {
        supply: () => Promise.resolve(supply),
        borrow: () => Promise.resolve(borrow),
        positions: () => Promise.resolve(positions),
        rates: () => Promise.resolve(rates),
      },
    }),
};
