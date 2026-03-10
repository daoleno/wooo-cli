import ansis from "ansis";
import { defineCommand } from "citty";
import { getActivePrivateKey } from "../../core/context";
import { createOutput, resolveOutputOptions } from "../../core/output";
import { HyperliquidClient } from "./client";

export default defineCommand({
  meta: { name: "short", description: "Open a short position" },
  args: {
    symbol: {
      type: "positional",
      description: "Trading symbol (e.g. BTC)",
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
    const symbol = `${args.symbol}/USDC:USDC`;
    const sizeUsd = parseFloat(args.size);
    const leverage = parseInt(args.leverage, 10);

    const client = new HyperliquidClient();
    const ticker = await client.fetchTicker(symbol);
    const amount = sizeUsd / ticker.last;

    if (args["dry-run"]) {
      out.data({
        action: "SHORT",
        symbol,
        sizeUsd,
        amount: amount.toFixed(6),
        estimatedPrice: ticker.last,
        leverage,
        status: "dry-run",
      });
      return;
    }

    if (!args.yes) {
      console.error(
        ansis.yellow(
          `⚠ About to SHORT ${args.symbol} with $${sizeUsd} at ${leverage}x leverage ~$${ticker.last}. Use --yes to confirm.`,
        ),
      );
      process.exit(6);
    }

    const pk = await getActivePrivateKey();
    const authClient = new HyperliquidClient(pk);
    await authClient.setLeverage(leverage, symbol);
    const result = await authClient.createMarketOrder(symbol, "sell", amount);
    out.data(result);
  },
});
