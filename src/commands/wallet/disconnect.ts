import { defineCommand } from "citty";
import { getExternalWalletRegistry } from "../../core/context";
import { createOutput, resolveOutputOptions } from "../../core/output";

export default defineCommand({
  meta: { name: "disconnect", description: "Remove an external wallet" },
  args: {
    name: {
      type: "positional",
      description: "Wallet name to disconnect",
      required: true,
    },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const registry = getExternalWalletRegistry();
    registry.remove(args.name);
    const out = createOutput(resolveOutputOptions(args));
    out.success(`Disconnected external wallet "${args.name}"`);
  },
});
