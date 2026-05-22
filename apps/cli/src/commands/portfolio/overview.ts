import { defineCommand } from "citty";
import { loadWoooConfig } from "../../core/config";
import {
  getCredentialField,
  getCredentialService,
  resolveOptionalCredentialField,
} from "../../core/credentials";
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

    // Find configured exchanges (those with both required secret refs set)
    const configured: Array<{
      id: string;
      apiKey: string;
      secret: string;
      password?: string;
    }> = [];
    for (const id of CEX_IDS) {
      const credentials = getCredentialService(id);
      const apiKey = await resolveOptionalCredentialField({
        config,
        field: getCredentialField(credentials, "apiKey"),
        service: credentials,
      });
      const secret = await resolveOptionalCredentialField({
        config,
        field: getCredentialField(credentials, "apiSecret"),
        service: credentials,
      });
      if (apiKey && secret) {
        const passphraseField = credentials.fields.find(
          (field) => field.key === "passphrase",
        );
        const password = passphraseField
          ? await resolveOptionalCredentialField({
              config,
              field: passphraseField,
              service: credentials,
            })
          : undefined;
        configured.push({
          id,
          apiKey: apiKey.reveal(),
          secret: secret.reveal(),
          password: password?.reveal(),
        });
      }
    }

    if (configured.length === 0) {
      out.warn(
        "No exchanges configured. Run `wooo-cli auth set okx`, `wooo-cli auth set binance`, or `wooo-cli auth set bybit`.",
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
