import { deletePolicy } from "@open-wallet-standard/core";
import { defineCommand } from "citty";
import { createOutput, resolveOutputOptions } from "../../../core/output";

export default defineCommand({
  meta: { name: "delete", description: "Delete a signing policy" },
  args: {
    id: {
      type: "positional",
      description: "Policy ID to delete",
      required: true,
    },
    confirm: {
      type: "boolean",
      description: "Confirm deletion (required)",
      default: false,
    },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    if (!args.confirm) {
      throw new Error(`Pass --confirm to delete policy "${args.id}"`);
    }
    deletePolicy(args.id);
    const out = createOutput(resolveOutputOptions(args));
    out.success(`Deleted policy "${args.id}"`);
  },
});
