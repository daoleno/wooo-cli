import { defineCommand } from "citty";
import { createOutput, resolveOutputOptions } from "../../core/output";
import { HyperliquidClient } from "./client";

export default defineCommand({
  meta: { name: "funding", description: "View funding rates" },
  args: {
    symbol: {
      type: "positional",
      description: "Trading symbol (e.g. BTC). If omitted, shows top symbols.",
      required: false,
    },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const client = new HyperliquidClient();
    const out = createOutput(resolveOutputOptions(args));

    if (args.symbol) {
      const symbol = `${args.symbol}/USDC:USDC`;
      const funding = await client.fetchFundingRate(symbol);
      out.data({
        symbol: funding.symbol,
        fundingRate: `${(funding.fundingRate * 100).toFixed(4)}%`,
        annualized: `${(funding.fundingRate * 100 * 365 * 3).toFixed(2)}%`,
      });
    } else {
      const symbols = ["BTC/USDC:USDC", "ETH/USDC:USDC", "SOL/USDC:USDC"];
      const results = await Promise.all(
        symbols.map((s) => client.fetchFundingRate(s)),
      );
      out.table(
        results.map((f) => ({
          symbol: f.symbol,
          rate: `${(f.fundingRate * 100).toFixed(4)}%`,
          annualized: `${(f.fundingRate * 100 * 365 * 3).toFixed(2)}%`,
        })),
        { columns: ["symbol", "rate", "annualized"], title: "Funding Rates" },
      );
    }
  },
});
