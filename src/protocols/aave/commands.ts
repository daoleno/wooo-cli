import { defineCommand } from "citty";
import { evmChainArg } from "../../core/chains";
import { getActiveWallet } from "../../core/context";
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
  createAaveRepayOperation,
  createAaveSupplyOperation,
  createAaveWithdrawOperation,
} from "./operations";

const SUPPORTED_CHAINS = [
  "ethereum",
  "arbitrum",
  "optimism",
  "polygon",
  "base",
];

async function runAaveCommand<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}

function validateAmountMode(
  amount: string | undefined,
  all: boolean | undefined,
  label = "Amount",
): { amount?: number; all: boolean } {
  const useAll = Boolean(all);

  if (useAll && amount) {
    console.error(`Error: ${label} cannot be combined with --all`);
    process.exit(1);
  }

  if (!useAll && !amount) {
    console.error(`Error: ${label} is required unless --all is set`);
    process.exit(1);
  }

  return {
    amount: amount ? validateAmount(amount, label) : undefined,
    all: useAll,
  };
}

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
    market: {
      type: "string",
      description: "Aave market name or pool address",
      required: false,
    },
    chain: evmChainArg(),
    yes: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const token = validateTokenSymbol(args.token);
    const amount = validateAmount(args.amount);
    const chain = validateChain(args.chain, SUPPORTED_CHAINS);
    await runAaveCommand(() =>
      runWriteOperation(
        args,
        createAaveSupplyOperation({
          token,
          amount,
          chain,
          market: args.market,
        }),
      ),
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
    market: {
      type: "string",
      description: "Aave market name or pool address",
      required: false,
    },
    chain: evmChainArg(),
    yes: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const token = validateTokenSymbol(args.token);
    const amount = validateAmount(args.amount);
    const chain = validateChain(args.chain, SUPPORTED_CHAINS);
    await runAaveCommand(() =>
      runWriteOperation(
        args,
        createAaveBorrowOperation({
          token,
          amount,
          chain,
          market: args.market,
        }),
      ),
    );
  },
});

const withdraw = defineCommand({
  meta: { name: "withdraw", description: "Withdraw supplied tokens from Aave" },
  args: {
    token: {
      type: "positional",
      description: "Token to withdraw (e.g. USDC, WETH)",
      required: true,
    },
    amount: {
      type: "positional",
      description: "Amount to withdraw",
      required: false,
    },
    all: { type: "boolean", default: false },
    market: {
      type: "string",
      description: "Aave market name or pool address",
      required: false,
    },
    chain: evmChainArg(),
    yes: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const token = validateTokenSymbol(args.token);
    const chain = validateChain(args.chain, SUPPORTED_CHAINS);
    const { amount, all } = validateAmountMode(args.amount, args.all);
    await runAaveCommand(() =>
      runWriteOperation(
        args,
        createAaveWithdrawOperation({
          token,
          amount,
          all,
          chain,
          market: args.market,
        }),
      ),
    );
  },
});

const repay = defineCommand({
  meta: { name: "repay", description: "Repay borrowed tokens on Aave" },
  args: {
    token: {
      type: "positional",
      description: "Token to repay (e.g. USDC, WETH)",
      required: true,
    },
    amount: {
      type: "positional",
      description: "Amount to repay",
      required: false,
    },
    all: { type: "boolean", default: false },
    market: {
      type: "string",
      description: "Aave market name or pool address",
      required: false,
    },
    chain: evmChainArg(),
    yes: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const token = validateTokenSymbol(args.token);
    const chain = validateChain(args.chain, SUPPORTED_CHAINS);
    const { amount, all } = validateAmountMode(args.amount, args.all);
    await runAaveCommand(() =>
      runWriteOperation(
        args,
        createAaveRepayOperation({
          token,
          amount,
          all,
          chain,
          market: args.market,
        }),
      ),
    );
  },
});

const positions = defineCommand({
  meta: { name: "positions", description: "View Aave account positions" },
  args: {
    market: {
      type: "string",
      description: "Aave market name or pool address",
      required: false,
    },
    chain: evmChainArg(),
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));
    const chain = validateChain(args.chain, SUPPORTED_CHAINS);
    const wallet = await getActiveWallet("evm");
    const client = new AaveClient(chain);
    const result = await runAaveCommand(() =>
      client.positions(wallet.address, args.market),
    );
    out.data(result);
  },
});

const markets = defineCommand({
  meta: { name: "markets", description: "List Aave V3 reserves for a chain" },
  args: {
    market: {
      type: "string",
      description: "Aave market name or pool address",
      required: false,
    },
    chain: evmChainArg(),
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const outputOptions = resolveOutputOptions(args);
    const out = createOutput(outputOptions);
    const chain = validateChain(args.chain, SUPPORTED_CHAINS);
    const client = new AaveClient(chain);
    const result = await runAaveCommand(() => client.markets(args.market));

    if (outputOptions.json || outputOptions.format === "json") {
      out.data({ chain, markets: result });
      return;
    }

    out.table(
      result.map((market) => ({ ...market })),
      {
        columns: [
          "market",
          "token",
          "supplyAPY",
          "variableBorrowAPY",
          "ltv",
          "collateralEnabled",
          "borrowingEnabled",
          "active",
          "frozen",
        ],
        title: "Aave Markets",
      },
    );
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
    market: {
      type: "string",
      description: "Aave market name or pool address",
      required: false,
    },
    chain: evmChainArg(),
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));
    const token = validateTokenSymbol(args.token);
    const chain = validateChain(args.chain, SUPPORTED_CHAINS);
    const client = new AaveClient(chain);
    const result = await runAaveCommand(() => client.rates(token, args.market));
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
        withdraw: () => Promise.resolve(withdraw),
        borrow: () => Promise.resolve(borrow),
        repay: () => Promise.resolve(repay),
        positions: () => Promise.resolve(positions),
        markets: () => Promise.resolve(markets),
        rates: () => Promise.resolve(rates),
      },
    }),
};
