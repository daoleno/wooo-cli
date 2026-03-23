import { defineCommand } from "citty";
import { createApiKey } from "@open-wallet-standard/core";
import { resolvePassphrase } from "../../../core/context";
import { createOutput, resolveOutputOptions } from "../../../core/output";

export default defineCommand({
  meta: { name: "create", description: "Create an API key for agent access" },
  args: {
    name: {
      type: "positional",
      description: "API key name",
      required: true,
    },
    wallet: {
      type: "string",
      description:
        "Wallet names to grant access to (comma-separated or repeated)",
    },
    policy: {
      type: "string",
      description:
        "Policy IDs to apply (comma-separated or repeated)",
    },
    expires: {
      type: "string",
      description: "Expiry as ISO 8601 date-time, e.g. 2026-12-31T23:59:59Z",
    },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const walletIds = args.wallet
      ? args.wallet.split(",").map((s: string) => s.trim()).filter(Boolean)
      : [];
    const policyIds = args.policy
      ? args.policy.split(",").map((s: string) => s.trim()).filter(Boolean)
      : [];

    const passphrase = await resolvePassphrase();
    if (!passphrase) {
      throw new Error("A passphrase is required to create an API key");
    }

    const result = createApiKey(
      args.name,
      walletIds,
      policyIds,
      passphrase,
      args.expires,
    );

    const out = createOutput(resolveOutputOptions(args));
    out.warn(
      "Store this token securely — it will not be shown again.",
    );
    out.data({ id: result.id, name: result.name, token: result.token });
  },
});
