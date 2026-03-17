import { defineCommand } from "citty";
import { getWalletStore } from "../../core/context";
import { createOutput, resolveOutputOptions } from "../../core/output";

export default defineCommand({
  meta: { name: "list", description: "List all wallets" },
  args: {
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const store = getWalletStore();
    const wallets = await store.list();
    const outputOptions = resolveOutputOptions(args);
    const out = createOutput(outputOptions);
    if (wallets.length === 0) {
      out.warn("No wallets found. Run `wooo wallet generate` to create one.");
      return;
    }
    const includeTransport = wallets.some((wallet) => wallet.transport);
    const rows = wallets.map((wallet) => ({
      name: wallet.name,
      address: wallet.address,
      chain: wallet.chain,
      mode: wallet.mode,
      ...(includeTransport && wallet.transport
        ? { transport: wallet.transport }
        : {}),
      active: wallet.active,
    }));

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
        columns: includeTransport
          ? ["name", "address", "chain", "mode", "transport", "active"]
          : ["name", "address", "chain", "mode", "active"],
        title: "Wallets",
      },
    );
  },
});
