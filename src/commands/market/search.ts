import { defineCommand } from "citty";
import { createOutput, resolveOutputOptions } from "../../core/output";
import { CexClient } from "../../protocols/cex-base/client";

export default defineCommand({
  meta: { name: "search", description: "Search markets by keyword" },
  args: {
    keyword: {
      type: "positional",
      description: "Search keyword (e.g. BTC, DOGE)",
      required: true,
    },
    exchange: {
      type: "string",
      description: "Exchange to search (default: binance)",
      default: "binance",
    },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));
    const client = new CexClient(args.exchange);
    const markets = await client.fetchMarkets();

    const keyword = args.keyword.toUpperCase();
    const matched = markets
      .filter((m) => m?.symbol?.toUpperCase().includes(keyword))
      .slice(0, 20);

    if (matched.length === 0) {
      out.warn(
        `No markets found matching "${args.keyword}" on ${args.exchange}`,
      );
      return;
    }

    out.table(
      matched.filter(Boolean).map((m) => ({
        symbol: m!.symbol,
        type: m!.type ?? "spot",
        base: m!.base ?? "",
        quote: m!.quote ?? "",
        active: m!.active ? "✓" : "✗",
      })),
      {
        columns: ["symbol", "type", "base", "quote", "active"],
        title: `Markets matching "${args.keyword}"`,
      },
    );
  },
});
