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
    const out = createOutput(resolveOutputOptions(args));
    if (wallets.length === 0) { out.warn("No wallets found. Run `wooo wallet generate` to create one."); return; }
    out.table(
      wallets.map((w) => ({ name: w.name, address: w.address, chain: w.chain, active: w.active ? "✓" : "" })),
      { columns: ["name", "address", "chain", "active"], title: "Wallets" }
    );
  },
});
