import { readFileSync } from "node:fs";
import { createPolicy } from "@open-wallet-standard/core";
import { defineCommand } from "citty";
import { getVaultPath } from "../../../core/config";
import { createOutput, resolveOutputOptions } from "../../../core/output";

export default defineCommand({
  meta: {
    name: "create",
    description: "Create a signing policy from a JSON file",
  },
  args: {
    file: {
      type: "positional",
      description: "Path to the policy JSON file",
      required: true,
    },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const policyJson = readFileSync(args.file, "utf-8");
    createPolicy(policyJson, getVaultPath());
    const out = createOutput(resolveOutputOptions(args));
    out.success("Policy created successfully");
  },
});
