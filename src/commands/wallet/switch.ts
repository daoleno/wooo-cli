import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getWallet } from "@open-wallet-standard/core";
import { defineCommand } from "citty";
import {
  ensureConfigDir,
  getConfigDir,
  getConfigPath,
} from "../../core/config";
import { getExternalWalletRegistry } from "../../core/context";
import { createOutput, resolveOutputOptions } from "../../core/output";

export default defineCommand({
  meta: { name: "switch", description: "Switch active wallet" },
  args: {
    name: {
      type: "positional",
      description: "Wallet name to activate",
      required: true,
    },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const vaultPath = join(getConfigDir(), "vault");

    // Validate wallet exists in OWS vault or external registry
    let found = false;
    try {
      getWallet(args.name, vaultPath);
      found = true;
    } catch {
      // Not in OWS vault
    }

    if (!found) {
      const ext = getExternalWalletRegistry().get(args.name);
      if (ext) {
        found = true;
      }
    }

    if (!found) {
      console.error(
        `Wallet "${args.name}" not found in OWS vault or external wallets.`,
      );
      process.exit(1);
    }

    // Update config file
    const configDir = getConfigDir();
    ensureConfigDir(configDir);
    const configPath = getConfigPath(configDir);
    let configData: Record<string, unknown> = {};
    try {
      configData = JSON.parse(readFileSync(configPath, "utf-8")) as Record<
        string,
        unknown
      >;
    } catch {
      // Config file doesn't exist or is invalid — start fresh
    }

    if (
      typeof configData.default !== "object" ||
      configData.default === null ||
      Array.isArray(configData.default)
    ) {
      configData.default = {};
    }
    (configData.default as Record<string, unknown>).wallet = args.name;
    writeFileSync(configPath, JSON.stringify(configData, null, 2));

    const out = createOutput(resolveOutputOptions(args));
    out.success(`Switched active wallet to "${args.name}"`);
  },
});
