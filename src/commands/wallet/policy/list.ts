import { listPolicies } from "@open-wallet-standard/core";
import { defineCommand } from "citty";
import { createOutput, resolveOutputOptions } from "../../../core/output";

export default defineCommand({
  meta: { name: "list", description: "List all signing policies" },
  args: {
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const policies = listPolicies();
    const out = createOutput(resolveOutputOptions(args));
    out.data(policies);
  },
});
