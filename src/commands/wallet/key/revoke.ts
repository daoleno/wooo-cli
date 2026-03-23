import { defineCommand } from "citty";
import { revokeApiKey } from "@open-wallet-standard/core";
import { createOutput, resolveOutputOptions } from "../../../core/output";

export default defineCommand({
  meta: { name: "revoke", description: "Revoke an API key" },
  args: {
    id: {
      type: "positional",
      description: "API key ID to revoke",
      required: true,
    },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    revokeApiKey(args.id);
    const out = createOutput(resolveOutputOptions(args));
    out.success(`Revoked API key "${args.id}"`);
  },
});
