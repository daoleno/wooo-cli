import { defineCommand } from "citty";
import { validateAmount, validateLeverage } from "../../core/validation";
import { runWriteOperation } from "../../core/write-operation";
import { createHyperliquidOrderOperation } from "./operations";

export default defineCommand({
  meta: { name: "long", description: "Open a long position" },
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
    const sizeUsd = validateAmount(args.size, "Position size");
    const leverage = validateLeverage(args.leverage);
    await runWriteOperation(
      args,
      createHyperliquidOrderOperation({
        asset: args.symbol,
        leverage,
        side: "long",
        sizeUsd,
      }),
    );
  },
});
