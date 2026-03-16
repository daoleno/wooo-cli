import { defineCommand } from "citty";
import { getActivePrivateKey } from "../../core/context";
import { createOutput, resolveOutputOptions } from "../../core/output";
import {
  validateAmount,
  validateChain,
  validateTokenSymbol,
} from "../../core/validation";
import { runWriteOperation } from "../../core/write-operation";
import type { ProtocolDefinition } from "../types";
import { AaveClient } from "./client";
import {
  createAaveBorrowOperation,
  createAaveSupplyOperation,
} from "./operations";

const SUPPORTED_CHAINS = [
  "ethereum",
  "arbitrum",
  "optimism",
  "polygon",
  "base",
];

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
    const token = validateTokenSymbol(args.token);
    const amount = validateAmount(args.amount);
    const chain = validateChain(args.chain, SUPPORTED_CHAINS);
    await runWriteOperation(
      args,
      createAaveSupplyOperation({
        token,
        amount,
        chain,
      }),
    );
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
    const token = validateTokenSymbol(args.token);
    const amount = validateAmount(args.amount);
    const chain = validateChain(args.chain, SUPPORTED_CHAINS);
    await runWriteOperation(
      args,
      createAaveBorrowOperation({
        token,
        amount,
        chain,
      }),
    );
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
    const chain = validateChain(args.chain, SUPPORTED_CHAINS);
    const privateKey = await getActivePrivateKey("evm");
    const client = new AaveClient(chain, privateKey);
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
    const token = validateTokenSymbol(args.token);
    const chain = validateChain(args.chain, SUPPORTED_CHAINS);
    const client = new AaveClient(chain);
    const result = await client.rates(token);
    out.data(result);
  },
});

export const aaveProtocol: ProtocolDefinition = {
  name: "aave",
  displayName: "Aave V3",
  type: "lending",
  chains: SUPPORTED_CHAINS,
  writeAccountType: "evm",
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
