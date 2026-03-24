import { getPolicy } from "@open-wallet-standard/core";
import { defineCommand } from "citty";
import { createOutput, resolveOutputOptions } from "../../../core/output";

export default defineCommand({
  meta: { name: "show", description: "Show details of a signing policy" },
  args: {
    id: {
      type: "positional",
      description: "Policy ID",
      required: true,
    },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const policy = getPolicy(args.id);
    const out = createOutput(resolveOutputOptions(args));
    out.data(policy);
  },
});
