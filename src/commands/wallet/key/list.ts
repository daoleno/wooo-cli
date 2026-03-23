import { defineCommand } from "citty";
import { listApiKeys } from "@open-wallet-standard/core";
import { createOutput, resolveOutputOptions } from "../../../core/output";

export default defineCommand({
  meta: { name: "list", description: "List all API keys" },
  args: {
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const keys = listApiKeys();
    const out = createOutput(resolveOutputOptions(args));
    out.data(keys);
  },
});
