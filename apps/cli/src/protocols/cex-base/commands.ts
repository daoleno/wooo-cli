import { defineCommand } from "citty";
import { createOutput, resolveOutputOptions } from "../../core/output";
import {
  validateAmount,
  validateLeverage,
  validatePair,
} from "../../core/validation";
import { runWriteOperation } from "../../core/write-operation";
import type { CexClientOptions } from "./client";
import { CexClient } from "./client";
import {
  type AuthResolver,
  createFuturesOrderOperation,
  createSpotOrderOperation,
  resolveExchangeAuthFromConfig,
} from "./operations";

export {
  createFuturesOrderExecutionPlan,
  createSpotOrderExecutionPlan,
} from "./operations";

export function createCexCommands(
  exchangeId: string,
  resolveAuth: AuthResolver,
) {
  function createClient(opts: CexClientOptions = {}) {
    return new CexClient(exchangeId, opts);
  }

  const spotBuy = defineCommand({
    meta: { name: "buy", description: "Spot market buy" },
    args: {
      pair: {
        type: "positional",
        description: "Trading pair (e.g. BTC/USDT)",
        required: true,
      },
      amount: {
        type: "positional",
        description: "Amount to buy",
        required: true,
      },
      yes: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      format: { type: "string", default: "table" },
    },
    async run({ args }) {
      const pair = validatePair(args.pair);
      const amount = validateAmount(args.amount);
      await runWriteOperation(
        args,
        createSpotOrderOperation({
          exchangeId,
          pair,
          amount,
          resolveAuth,
          side: "buy",
        }),
      );
    },
  });

  const spotSell = defineCommand({
    meta: { name: "sell", description: "Spot market sell" },
    args: {
      pair: {
        type: "positional",
        description: "Trading pair (e.g. BTC/USDT)",
        required: true,
      },
      amount: {
        type: "positional",
        description: "Amount to sell",
        required: true,
      },
      yes: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      format: { type: "string", default: "table" },
    },
    async run({ args }) {
      const pair = validatePair(args.pair);
      const amount = validateAmount(args.amount);
      await runWriteOperation(
        args,
        createSpotOrderOperation({
          exchangeId,
          pair,
          amount,
          resolveAuth,
          side: "sell",
        }),
      );
    },
  });

  const futuresLong = defineCommand({
    meta: { name: "long", description: "Open a long futures position" },
    args: {
      symbol: {
        type: "positional",
        description: "Symbol (e.g. BTC/USDT:USDT)",
        required: true,
      },
      size: {
        type: "positional",
        description: "Position size in USD",
        required: true,
      },
      leverage: {
        type: "string",
        description: "Leverage (default: 1)",
        default: "1",
      },
      yes: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      format: { type: "string", default: "table" },
    },
    async run({ args }) {
      const sizeUsd = validateAmount(args.size, "Position size");
      const leverage = validateLeverage(args.leverage);
      await runWriteOperation(
        args,
        createFuturesOrderOperation({
          exchangeId,
          leverage,
          resolveAuth,
          side: "long",
          sizeUsd,
          symbol: args.symbol,
        }),
      );
    },
  });

  const futuresShort = defineCommand({
    meta: { name: "short", description: "Open a short futures position" },
    args: {
      symbol: {
        type: "positional",
        description: "Symbol (e.g. BTC/USDT:USDT)",
        required: true,
      },
      size: {
        type: "positional",
        description: "Position size in USD",
        required: true,
      },
      leverage: {
        type: "string",
        description: "Leverage (default: 1)",
        default: "1",
      },
      yes: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      format: { type: "string", default: "table" },
    },
    async run({ args }) {
      const sizeUsd = validateAmount(args.size, "Position size");
      const leverage = validateLeverage(args.leverage);
      await runWriteOperation(
        args,
        createFuturesOrderOperation({
          exchangeId,
          leverage,
          resolveAuth,
          side: "short",
          sizeUsd,
          symbol: args.symbol,
        }),
      );
    },
  });

  const balance = defineCommand({
    meta: { name: "balance", description: "View account balance" },
    args: {
      json: { type: "boolean", default: false },
      format: { type: "string", default: "table" },
    },
    async run({ args }) {
      const auth = await resolveAuth();
      const client = createClient(auth);
      const balances = await client.fetchBalance();
      const out = createOutput(resolveOutputOptions(args));

      if (balances.length === 0) {
        out.warn("No balances found");
        return;
      }

      out.table(
        balances.map((b) => ({
          currency: b.currency,
          free: b.free.toFixed(4),
          used: b.used.toFixed(4),
          total: b.total.toFixed(4),
        })),
        {
          columns: ["currency", "free", "used", "total"],
          title: `${exchangeId.toUpperCase()} Balance`,
        },
      );
    },
  });

  const positions = defineCommand({
    meta: { name: "positions", description: "View open futures positions" },
    args: {
      json: { type: "boolean", default: false },
      format: { type: "string", default: "table" },
    },
    async run({ args }) {
      const auth = await resolveAuth();
      const client = createClient(auth);
      const pos = await client.fetchPositions();
      const out = createOutput(resolveOutputOptions(args));

      if (pos.length === 0) {
        out.warn("No open positions");
        return;
      }

      out.table(
        pos.map((p) => ({
          symbol: p.symbol,
          side: p.side,
          size: p.size,
          entry: p.entryPrice.toFixed(2),
          mark: p.markPrice.toFixed(2),
          pnl: p.pnl.toFixed(2),
          leverage: `${p.leverage}x`,
        })),
        {
          columns: [
            "symbol",
            "side",
            "size",
            "entry",
            "mark",
            "pnl",
            "leverage",
          ],
          title: `${exchangeId.toUpperCase()} Positions`,
        },
      );
    },
  });

  return { spotBuy, spotSell, futuresLong, futuresShort, balance, positions };
}

export const resolveAuthFromConfig = resolveExchangeAuthFromConfig;
