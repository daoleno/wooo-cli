import { defineCommand } from "citty";
import { getActiveWallet } from "../../core/context";
import { createOutput, resolveOutputOptions } from "../../core/output";
import { HyperliquidClient } from "./client";

export default defineCommand({
  meta: { name: "positions", description: "View open positions" },
  args: {
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const wallet = await getActiveWallet("evm");
    const client = new HyperliquidClient(wallet.address);
    const positions = await client.fetchPositions();
    const out = createOutput(resolveOutputOptions(args));

    if (positions.length === 0) {
      out.warn("No open positions");
      return;
    }

    out.table(
      positions.map((p) => ({
        symbol: p.symbol,
        side: p.side,
        size: p.size,
        entry: p.entryPrice.toFixed(2),
        mark: p.markPrice.toFixed(2),
        pnl: p.pnl.toFixed(2),
        leverage: `${p.leverage}x`,
      })),
      {
        columns: ["symbol", "side", "size", "entry", "mark", "pnl", "leverage"],
        title: "Hyperliquid Positions",
      },
    );
  },
});
