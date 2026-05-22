import { defineCommand } from "citty";
import { getRemoteAccountRegistry } from "../../core/context";
import { createOutput, resolveOutputOptions } from "../../core/output";

export default defineCommand({
  meta: { name: "disconnect", description: "Remove a remote account" },
  args: {
    name: {
      type: "positional",
      description: "Wallet label to disconnect",
      required: true,
    },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const registry = getRemoteAccountRegistry();
    registry.remove(args.name);
    const out = createOutput(resolveOutputOptions(args));
    out.success(`Disconnected remote account "${args.name}"`);
  },
});
