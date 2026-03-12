import { defineCommand } from "citty";
import { confirmTransaction } from "../../core/confirm";
import { getActivePrivateKey } from "../../core/context";
import { createOutput, resolveOutputOptions } from "../../core/output";
import { validateAmount, validateLeverage } from "../../core/validation";
import type { ProtocolDefinition } from "../types";
import { GmxClient } from "./client";

const long = defineCommand({
  meta: { name: "long", description: "Open a long position on GMX" },
  args: {
    symbol: {
      type: "positional",
      description: "Market (e.g. ETH/USD, BTC/USD)",
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

    const confirmed = await confirmTransaction(
      {
        action: `LONG ${args.symbol} with $${sizeUsd} at ${leverage}x on GMX`,
        details: {
          symbol: args.symbol,
          sizeUsd,
          leverage: `${leverage}x`,
          protocol: "GMX V2",
          chain: "arbitrum",
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
          leverage,
          protocol: "GMX V2",
          chain: "arbitrum",
          status: "dry-run",
        });
      }
      return;
    }

    const privateKey = await getActivePrivateKey("evm");
    const client = new GmxClient(privateKey);
    const result = await client.openPosition(
      args.symbol,
      "long",
      sizeUsd,
      leverage,
    );
    out.data(result);
  },
});

const short = defineCommand({
  meta: { name: "short", description: "Open a short position on GMX" },
  args: {
    symbol: {
      type: "positional",
      description: "Market (e.g. ETH/USD, BTC/USD)",
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

    const confirmed = await confirmTransaction(
      {
        action: `SHORT ${args.symbol} with $${sizeUsd} at ${leverage}x on GMX`,
        details: {
          symbol: args.symbol,
          sizeUsd,
          leverage: `${leverage}x`,
          protocol: "GMX V2",
          chain: "arbitrum",
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
          leverage,
          protocol: "GMX V2",
          chain: "arbitrum",
          status: "dry-run",
        });
      }
      return;
    }

    const privateKey = await getActivePrivateKey("evm");
    const client = new GmxClient(privateKey);
    const result = await client.openPosition(
      args.symbol,
      "short",
      sizeUsd,
      leverage,
    );
    out.data(result);
  },
});

const positions = defineCommand({
  meta: { name: "positions", description: "View open GMX positions" },
  args: {
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));
    const privateKey = await getActivePrivateKey("evm");
    const client = new GmxClient(privateKey);
    const pos = await client.positions();

    if (pos.length === 0) {
      out.warn("No open positions on GMX");
      return;
    }

    out.table(pos as unknown as Record<string, unknown>[], {
      columns: ["symbol", "side", "size", "collateral", "leverage"],
      title: "GMX Positions",
    });
  },
});

const markets = defineCommand({
  meta: { name: "markets", description: "List available GMX markets" },
  args: {
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));
    const client = new GmxClient();
    out.data({ markets: client.markets(), chain: "arbitrum" });
  },
});

export const gmxProtocol: ProtocolDefinition = {
  name: "gmx",
  displayName: "GMX V2",
  type: "perps",
  chains: ["arbitrum"],
  requiresAuth: false,
  setup: () =>
    defineCommand({
      meta: { name: "gmx", description: "GMX V2 perpetual futures" },
      subCommands: {
        long: () => Promise.resolve(long),
        short: () => Promise.resolve(short),
        positions: () => Promise.resolve(positions),
        markets: () => Promise.resolve(markets),
      },
    }),
};
