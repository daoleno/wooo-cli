import { join } from "node:path";
import { listWallets } from "@open-wallet-standard/core";
import { defineCommand } from "citty";
import { getConfigDir, loadWoooConfigSync } from "../../core/config";
import { getExternalWalletRegistry } from "../../core/context";
import { createOutput, resolveOutputOptions } from "../../core/output";

export default defineCommand({
  meta: { name: "list", description: "List all wallets" },
  args: {
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const config = loadWoooConfigSync();
    const activeWalletName = config.default?.wallet ?? "main";
    const vaultPath = join(getConfigDir(), "vault");
    const outputOptions = resolveOutputOptions(args);
    const out = createOutput(outputOptions);

    // Gather OWS vault wallets
    const owsWallets = listWallets(vaultPath);
    const rows: Record<string, unknown>[] = owsWallets.map((w) => {
      const evmAccount = w.accounts.find((a) =>
        a.chainId.startsWith("eip155:"),
      );
      const firstAccount = evmAccount ?? w.accounts[0];
      return {
        name: w.name,
        address: firstAccount?.address ?? "(none)",
        source: "ows",
        chain: firstAccount?.chainId ?? "",
        active: w.name === activeWalletName,
      };
    });

    // Gather external wallets
    const externalWallets = getExternalWalletRegistry().list();
    for (const ext of externalWallets) {
      rows.push({
        name: ext.name,
        address: ext.address,
        source: "external",
        chain: ext.chainType,
        active: ext.name === activeWalletName,
      });
    }

    if (rows.length === 0) {
      out.warn(
        "No wallets found. Run `wooo wallet create` for a local wallet or `wooo wallet connect` for an external wallet.",
      );
      return;
    }

    if (outputOptions.json || outputOptions.format === "json") {
      out.data(rows);
      return;
    }

    out.table(
      rows.map((wallet) => ({
        ...wallet,
        active: wallet.active ? "✓" : "",
      })),
      {
        columns: ["name", "address", "source", "chain", "active"],
        title: "Wallets",
      },
    );
  },
});
