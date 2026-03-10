import { defineCommand } from "citty";
import { loadWoooConfig } from "../../core/config";
import { createOutput, resolveOutputOptions } from "../../core/output";
import { CexClient } from "../../protocols/cex-base/client";

const CEX_IDS = ["okx", "binance", "bybit"] as const;

export default defineCommand({
  meta: {
    name: "overview",
    description: "Aggregated portfolio across all configured exchanges",
  },
  args: {
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));
    const config = await loadWoooConfig();

    // Find configured exchanges (those with apiKey set)
    const configured: Array<{
      id: string;
      apiKey: string;
      secret: string;
      password?: string;
    }> = [];
    for (const id of CEX_IDS) {
      const prefix = `WOOO_${id.toUpperCase()}_`;
      const exchangeConfig = config[id] as Record<string, string> | undefined;
      const apiKey = process.env[`${prefix}API_KEY`] || exchangeConfig?.apiKey;
      const secret =
        process.env[`${prefix}API_SECRET`] || exchangeConfig?.apiSecret;
      if (apiKey && secret) {
        configured.push({
          id,
          apiKey,
          secret,
          password:
            process.env[`${prefix}PASSPHRASE`] || exchangeConfig?.passphrase,
        });
      }
    }

    if (configured.length === 0) {
      out.warn(
        "No exchanges configured. Set API keys via env vars (WOOO_OKX_API_KEY, etc.) or wooo config set.",
      );
      return;
    }

    const allBalances: Array<{
      exchange: string;
      currency: string;
      total: number;
    }> = [];

    const results = await Promise.allSettled(
      configured.map(async (ex) => {
        const client = new CexClient(ex.id, {
          apiKey: ex.apiKey,
          secret: ex.secret,
          password: ex.password,
        });
        const balances = await client.fetchBalance();
        return { exchange: ex.id, balances };
      }),
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        for (const b of result.value.balances) {
          allBalances.push({
            exchange: result.value.exchange.toUpperCase(),
            currency: b.currency,
            total: b.total,
          });
        }
      }
    }

    if (allBalances.length === 0) {
      out.warn("No balances found across configured exchanges");
      return;
    }

    // Aggregate by currency
    const aggregated = new Map<
      string,
      { total: number; exchanges: string[] }
    >();
    for (const b of allBalances) {
      const existing = aggregated.get(b.currency) || {
        total: 0,
        exchanges: [],
      };
      existing.total += b.total;
      existing.exchanges.push(b.exchange);
      aggregated.set(b.currency, existing);
    }

    const rows = Array.from(aggregated.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .map(([currency, data]) => ({
        currency,
        total: data.total.toFixed(4),
        exchanges: data.exchanges.join(", "),
      }));

    out.table(rows, {
      columns: ["currency", "total", "exchanges"],
      title: "Portfolio Overview",
    });
  },
});
