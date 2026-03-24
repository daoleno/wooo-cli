import { listApiKeys } from "@open-wallet-standard/core";
import { defineCommand } from "citty";
import { getVaultPath } from "../../../core/config";
import { createOutput, resolveOutputOptions } from "../../../core/output";

export default defineCommand({
  meta: { name: "list", description: "List all API keys" },
  args: {
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const keys = listApiKeys(getVaultPath());
    const out = createOutput(resolveOutputOptions(args));
    out.data(keys);
  },
});
