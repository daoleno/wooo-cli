import { defineCommand } from "citty";
import { createOutput, resolveOutputOptions } from "../../core/output";
import { CexClient } from "../../protocols/cex-base/client";

const EXCHANGES = ["binance", "okx", "bybit"] as const;

export default defineCommand({
  meta: { name: "price", description: "Get aggregated price for a symbol" },
  args: {
    symbol: {
      type: "positional",
      description: "Symbol (e.g. BTC, ETH)",
      required: true,
    },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));
    const pair = args.symbol.includes("/")
      ? args.symbol
      : `${args.symbol}/USDT`;

    const results = await Promise.allSettled(
      EXCHANGES.map(async (id) => {
        const client = new CexClient(id);
        const ticker = await client.fetchTicker(pair);
        return { exchange: id as string, ...ticker };
      }),
    );

    const prices: Array<{
      exchange: string;
      symbol: string;
      last: number;
      high: number;
      low: number;
      volume: number;
      change24h: number;
    }> = [];
    for (const r of results) {
      if (r.status === "fulfilled") prices.push(r.value);
    }

    if (prices.length === 0) {
      out.warn(`Could not fetch price for ${pair} from any exchange`);
      return;
    }

    out.table(
      prices.map((p) => ({
        exchange: p.exchange.toUpperCase(),
        price: `$${p.last.toLocaleString()}`,
        "24h": `${p.change24h >= 0 ? "+" : ""}${p.change24h.toFixed(2)}%`,
        high: `$${p.high.toLocaleString()}`,
        low: `$${p.low.toLocaleString()}`,
        volume: p.volume.toFixed(2),
      })),
      {
        columns: ["exchange", "price", "24h", "high", "low", "volume"],
        title: `${args.symbol} Price`,
      },
    );
  },
});
