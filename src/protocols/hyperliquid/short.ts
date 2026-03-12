import { defineCommand } from "citty";
import { confirmTransaction } from "../../core/confirm";
import { getActivePrivateKey } from "../../core/context";
import { createOutput, resolveOutputOptions } from "../../core/output";
import { validateAmount, validateLeverage } from "../../core/validation";
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
    const sizeUsd = validateAmount(args.size, "Position size");
    const leverage = validateLeverage(args.leverage);

    const client = new HyperliquidClient();
    const ticker = await client.fetchTicker(symbol);
    const amount = sizeUsd / ticker.last;

    const confirmed = await confirmTransaction(
      {
        action: `SHORT ${args.symbol} on Hyperliquid`,
        details: {
          symbol,
          sizeUsd,
          amount: amount.toFixed(6),
          estimatedPrice: `$${ticker.last}`,
          leverage: `${leverage}x`,
        },
      },
      args,
    );

    if (!confirmed) {
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
      }
      return;
    }

    const pk = await getActivePrivateKey();
    const authClient = new HyperliquidClient(pk);
    await authClient.setLeverage(leverage, symbol);
    const result = await authClient.createMarketOrder(symbol, "sell", amount);
    out.data(result);
  },
});
