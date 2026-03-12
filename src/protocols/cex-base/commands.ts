import ansis from "ansis";
import { defineCommand } from "citty";
import { loadWoooConfig } from "../../core/config";
import { confirmTransaction } from "../../core/confirm";
import { createOutput, resolveOutputOptions } from "../../core/output";
import {
  validateAmount,
  validateLeverage,
  validatePair,
} from "../../core/validation";
import type { CexClientOptions } from "./client";
import { CexClient } from "./client";

type AuthResolver = () => Promise<CexClientOptions>;

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
      const out = createOutput(resolveOutputOptions(args));
      const pair = validatePair(args.pair);
      const amount = validateAmount(args.amount);

      const pubClient = createClient();
      const ticker = await pubClient.fetchTicker(pair);

      const confirmed = await confirmTransaction(
        {
          action: `BUY ${amount} ${pair}`,
          details: {
            pair,
            amount,
            estimatedPrice: `$${ticker.last}`,
            exchange: exchangeId,
          },
        },
        args,
      );

      if (!confirmed) {
        if (args["dry-run"]) {
          out.data({
            action: "BUY",
            pair,
            amount,
            estimatedPrice: ticker.last,
            status: "dry-run",
          });
        }
        return;
      }

      const auth = await resolveAuth();
      const client = createClient(auth);
      const result = await client.createSpotOrder(pair, "buy", amount);
      out.data(result);
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
      const out = createOutput(resolveOutputOptions(args));
      const pair = validatePair(args.pair);
      const amount = validateAmount(args.amount);

      const pubClient = createClient();
      const ticker = await pubClient.fetchTicker(pair);

      const confirmed = await confirmTransaction(
        {
          action: `SELL ${amount} ${pair}`,
          details: {
            pair,
            amount,
            estimatedPrice: `$${ticker.last}`,
            exchange: exchangeId,
          },
        },
        args,
      );

      if (!confirmed) {
        if (args["dry-run"]) {
          out.data({
            action: "SELL",
            pair,
            amount,
            estimatedPrice: ticker.last,
            status: "dry-run",
          });
        }
        return;
      }

      const auth = await resolveAuth();
      const client = createClient(auth);
      const result = await client.createSpotOrder(pair, "sell", amount);
      out.data(result);
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
      const out = createOutput(resolveOutputOptions(args));
      const sizeUsd = validateAmount(args.size, "Position size");
      const leverage = validateLeverage(args.leverage);

      const pubClient = createClient();
      const ticker = await pubClient.fetchTicker(args.symbol);
      const amount = sizeUsd / ticker.last;

      const confirmed = await confirmTransaction(
        {
          action: `LONG ${args.symbol} with $${sizeUsd} at ${leverage}x`,
          details: {
            symbol: args.symbol,
            sizeUsd,
            amount: amount.toFixed(6),
            estimatedPrice: `$${ticker.last}`,
            leverage: `${leverage}x`,
            exchange: exchangeId,
          },
        },
        args,
      );

      if (!confirmed) {
        if (args["dry-run"]) {
          out.data({
            action: "LONG",
            symbol: args.symbol,
            sizeUsd,
            amount: amount.toFixed(6),
            estimatedPrice: ticker.last,
            leverage,
            status: "dry-run",
          });
        }
        return;
      }

      const auth = await resolveAuth();
      const client = createClient(auth);
      const result = await client.createFuturesOrder(
        args.symbol,
        "buy",
        amount,
        leverage,
      );
      out.data(result);
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
      const out = createOutput(resolveOutputOptions(args));
      const sizeUsd = validateAmount(args.size, "Position size");
      const leverage = validateLeverage(args.leverage);

      const pubClient = createClient();
      const ticker = await pubClient.fetchTicker(args.symbol);
      const amount = sizeUsd / ticker.last;

      const confirmed = await confirmTransaction(
        {
          action: `SHORT ${args.symbol} with $${sizeUsd} at ${leverage}x`,
          details: {
            symbol: args.symbol,
            sizeUsd,
            amount: amount.toFixed(6),
            estimatedPrice: `$${ticker.last}`,
            leverage: `${leverage}x`,
            exchange: exchangeId,
          },
        },
        args,
      );

      if (!confirmed) {
        if (args["dry-run"]) {
          out.data({
            action: "SHORT",
            symbol: args.symbol,
            sizeUsd,
            amount: amount.toFixed(6),
            estimatedPrice: ticker.last,
            leverage,
            status: "dry-run",
          });
        }
        return;
      }

      const auth = await resolveAuth();
      const client = createClient(auth);
      const result = await client.createFuturesOrder(
        args.symbol,
        "sell",
        amount,
        leverage,
      );
      out.data(result);
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

export async function resolveAuthFromConfig(
  exchangeId: string,
): Promise<CexClientOptions> {
  const config = await loadWoooConfig();
  const exchangeConfig = config[exchangeId] as
    | Record<string, string>
    | undefined;

  // Check env vars first: WOOO_OKX_API_KEY, WOOO_OKX_API_SECRET, etc.
  const prefix = `WOOO_${exchangeId.toUpperCase()}_`;
  const apiKey = process.env[`${prefix}API_KEY`] || exchangeConfig?.apiKey;
  const secret =
    process.env[`${prefix}API_SECRET`] || exchangeConfig?.apiSecret;
  const password =
    process.env[`${prefix}PASSPHRASE`] || exchangeConfig?.passphrase;

  if (!apiKey || !secret) {
    console.error(
      `Error: ${exchangeId.toUpperCase()} API credentials not configured.`,
    );
    console.error(
      `Set ${prefix}API_KEY and ${prefix}API_SECRET env vars, or run: wooo config set ${exchangeId}.apiKey <key>`,
    );
    process.exit(3);
  }

  return { apiKey, secret, password };
}
