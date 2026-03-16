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
import { MorphoClient } from "./client";
import {
  createMorphoBorrowOperation,
  createMorphoRepayOperation,
  createMorphoSupplyCollateralOperation,
  createMorphoSupplyOperation,
  createMorphoWithdrawCollateralOperation,
  createMorphoWithdrawOperation,
} from "./operations";

const SUPPORTED_CHAINS = [
  "ethereum",
  "arbitrum",
  "optimism",
  "polygon",
  "base",
];

function toTableRows(rows: object[]): Record<string, unknown>[] {
  return rows.map((row) => ({ ...row }));
}

function validateLimit(value: string | undefined, fallback = 10): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0 || parsed > 100) {
    console.error("Error: limit must be an integer between 1 and 100");
    process.exit(1);
  }

  return parsed;
}

function validateMarketId(value: string): string {
  const normalized = value.trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    console.error("Error: market id must be a 32-byte hex string");
    process.exit(1);
  }
  return normalized;
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

const markets = defineCommand({
  meta: {
    name: "markets",
    description: "List Morpho markets for a chain",
  },
  args: {
    chain: evmChainArg(),
    search: { type: "string", required: false },
    "loan-token": { type: "string", required: false },
    "collateral-token": { type: "string", required: false },
    limit: { type: "string", default: "10" },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const outputOptions = resolveOutputOptions(args);
    const out = createOutput(outputOptions);
    const chain = validateChain(args.chain, SUPPORTED_CHAINS);
    const client = new MorphoClient(chain);
    const list = await client.markets({
      search: args.search,
      loanToken: args["loan-token"]
        ? validateTokenSymbol(args["loan-token"], "Loan token")
        : undefined,
      collateralToken: args["collateral-token"]
        ? validateTokenSymbol(args["collateral-token"], "Collateral token")
        : undefined,
      limit: validateLimit(args.limit),
    });

    if (outputOptions.json || outputOptions.format === "json") {
      out.data({ chain, markets: list });
      return;
    }

    out.table(toTableRows(list), {
      columns: [
        "marketId",
        "loanToken",
        "collateralToken",
        "borrowAPY",
        "supplyAPY",
        "totalLiquidity",
        "lltv",
      ],
      title: "Morpho Markets",
    });
  },
});

const market = defineCommand({
  meta: {
    name: "market",
    description: "Show live state for a specific Morpho market",
  },
  args: {
    marketId: {
      type: "positional",
      description: "Morpho market unique key",
      required: true,
    },
    chain: evmChainArg(),
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));
    const chain = validateChain(args.chain, SUPPORTED_CHAINS);
    const marketId = validateMarketId(args.marketId);
    const client = new MorphoClient(chain);
    out.data(await client.market(marketId));
  },
});

const positions = defineCommand({
  meta: {
    name: "positions",
    description: "View Morpho positions for the active wallet",
  },
  args: {
    chain: evmChainArg(),
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const outputOptions = resolveOutputOptions(args);
    const out = createOutput(outputOptions);
    const chain = validateChain(args.chain, SUPPORTED_CHAINS);
    const wallet = await getActiveWallet("evm");
    const client = new MorphoClient(chain);
    const list = await client.positions(wallet.address);

    if (outputOptions.json || outputOptions.format === "json") {
      out.data({
        address: wallet.address,
        chain,
        positions: list,
      });
      return;
    }

    out.table(toTableRows(list), {
      columns: [
        "marketId",
        "loanToken",
        "collateralToken",
        "supplied",
        "borrowed",
        "collateral",
        "maxBorrowable",
        "healthFactor",
      ],
      title: "Morpho Positions",
    });
  },
});

const supply = defineCommand({
  meta: {
    name: "supply",
    description: "Supply loan assets to a specific Morpho market",
  },
  args: {
    marketId: {
      type: "positional",
      description: "Morpho market unique key",
      required: true,
    },
    amount: {
      type: "positional",
      description: "Amount of loan asset to supply",
      required: true,
    },
    chain: evmChainArg(),
    yes: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const chain = validateChain(args.chain, SUPPORTED_CHAINS);
    const marketId = validateMarketId(args.marketId);
    const amount = validateAmount(args.amount);
    await runWriteOperation(
      args,
      createMorphoSupplyOperation({ chain, marketId, amount }),
    );
  },
});

const withdraw = defineCommand({
  meta: {
    name: "withdraw",
    description: "Withdraw supplied loan assets from a Morpho market",
  },
  args: {
    marketId: {
      type: "positional",
      description: "Morpho market unique key",
      required: true,
    },
    amount: {
      type: "positional",
      description: "Amount of loan asset to withdraw",
      required: false,
    },
    all: { type: "boolean", default: false },
    chain: evmChainArg(),
    yes: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const chain = validateChain(args.chain, SUPPORTED_CHAINS);
    const marketId = validateMarketId(args.marketId);
    const { amount, all } = validateAmountMode(args.amount, args.all);
    await runWriteOperation(
      args,
      createMorphoWithdrawOperation({ chain, marketId, amount, all }),
    );
  },
});

const supplyCollateral = defineCommand({
  meta: {
    name: "supply-collateral",
    description: "Supply collateral assets to a Morpho market",
  },
  args: {
    marketId: {
      type: "positional",
      description: "Morpho market unique key",
      required: true,
    },
    amount: {
      type: "positional",
      description: "Amount of collateral asset to supply",
      required: true,
    },
    chain: evmChainArg(),
    yes: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const chain = validateChain(args.chain, SUPPORTED_CHAINS);
    const marketId = validateMarketId(args.marketId);
    const amount = validateAmount(args.amount, "Collateral amount");
    await runWriteOperation(
      args,
      createMorphoSupplyCollateralOperation({ chain, marketId, amount }),
    );
  },
});

const withdrawCollateral = defineCommand({
  meta: {
    name: "withdraw-collateral",
    description: "Withdraw collateral assets from a Morpho market",
  },
  args: {
    marketId: {
      type: "positional",
      description: "Morpho market unique key",
      required: true,
    },
    amount: {
      type: "positional",
      description: "Amount of collateral asset to withdraw",
      required: false,
    },
    all: { type: "boolean", default: false },
    chain: evmChainArg(),
    yes: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const chain = validateChain(args.chain, SUPPORTED_CHAINS);
    const marketId = validateMarketId(args.marketId);
    const { amount, all } = validateAmountMode(
      args.amount,
      args.all,
      "Collateral amount",
    );
    await runWriteOperation(
      args,
      createMorphoWithdrawCollateralOperation({ chain, marketId, amount, all }),
    );
  },
});

const borrow = defineCommand({
  meta: {
    name: "borrow",
    description: "Borrow loan assets from a Morpho market",
  },
  args: {
    marketId: {
      type: "positional",
      description: "Morpho market unique key",
      required: true,
    },
    amount: {
      type: "positional",
      description: "Amount of loan asset to borrow",
      required: true,
    },
    chain: evmChainArg(),
    yes: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const chain = validateChain(args.chain, SUPPORTED_CHAINS);
    const marketId = validateMarketId(args.marketId);
    const amount = validateAmount(args.amount);
    await runWriteOperation(
      args,
      createMorphoBorrowOperation({ chain, marketId, amount }),
    );
  },
});

const repay = defineCommand({
  meta: {
    name: "repay",
    description: "Repay borrowed loan assets on a Morpho market",
  },
  args: {
    marketId: {
      type: "positional",
      description: "Morpho market unique key",
      required: true,
    },
    amount: {
      type: "positional",
      description: "Amount of loan asset to repay",
      required: false,
    },
    all: { type: "boolean", default: false },
    chain: evmChainArg(),
    yes: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const chain = validateChain(args.chain, SUPPORTED_CHAINS);
    const marketId = validateMarketId(args.marketId);
    const { amount, all } = validateAmountMode(args.amount, args.all);
    await runWriteOperation(
      args,
      createMorphoRepayOperation({ chain, marketId, amount, all }),
    );
  },
});

export const morphoProtocol: ProtocolDefinition = {
  name: "morpho",
  displayName: "Morpho Markets V1",
  type: "lending",
  chains: SUPPORTED_CHAINS,
  writeAccountType: "evm",
  setup: () =>
    defineCommand({
      meta: {
        name: "morpho",
        description: "Morpho Markets V1 lending protocol",
      },
      subCommands: {
        markets: () => Promise.resolve(markets),
        market: () => Promise.resolve(market),
        positions: () => Promise.resolve(positions),
        supply: () => Promise.resolve(supply),
        withdraw: () => Promise.resolve(withdraw),
        "supply-collateral": () => Promise.resolve(supplyCollateral),
        "withdraw-collateral": () => Promise.resolve(withdrawCollateral),
        borrow: () => Promise.resolve(borrow),
        repay: () => Promise.resolve(repay),
      },
    }),
};
