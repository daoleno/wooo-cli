import { defineCommand } from "citty";
import { getWalletStore } from "../../core/context";
import { createOutput, resolveOutputOptions } from "../../core/output";

export default defineCommand({
  meta: { name: "switch", description: "Switch active wallet" },
  args: {
    name: {
      type: "positional",
      description: "Wallet name to activate",
      required: true,
    },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const store = getWalletStore();
    await store.setActive(args.name);
    const out = createOutput(resolveOutputOptions(args));
    out.success(`Switched active wallet to "${args.name}"`);
  },
});
