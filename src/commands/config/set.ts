import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { defineCommand } from "citty";
import { ensureConfigDir, getConfigPath } from "../../core/config";
import { validateSecretRef } from "../../core/secrets";

const RAW_SECRET_CONFIG_KEYS = new Set([
  "accessToken",
  "apiKey",
  "apiSecret",
  "apiToken",
  "authToken",
  "bearerToken",
  "mnemonic",
  "passphrase",
  "password",
  "privateKey",
  "secret",
  "token",
]);

const STRING_CONFIG_KEYS = new Set([
  "default.chain",
  "default.format",
  "default.wallet",
  "okx.baseUrl",
  "okxOnchain.baseUrl",
  "okxOnchain.projectId",
  "polymarket.depositWallet",
  "polymarket.owner",
  "polymarket.relayerApiKeyAddress",
]);

function parseConfigValue(key: string, rawValue: string): unknown {
  if (STRING_CONFIG_KEYS.has(key)) {
    return rawValue.trim();
  }

  const value = rawValue.trim();

  if (
    value.startsWith("{") ||
    value.startsWith("[") ||
    value.startsWith('"') ||
    value === "true" ||
    value === "false" ||
    value === "null"
  ) {
    return JSON.parse(value);
  }

  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }

  return rawValue;
}

function assertConfigKeyAllowed(parts: string[]): void {
  const leaf = parts[parts.length - 1];
  const normalizedLeaf = leaf.toLowerCase();
  const rawSecretKey = Array.from(RAW_SECRET_CONFIG_KEYS).find(
    (key) => key.toLowerCase() === normalizedLeaf,
  );
  if (rawSecretKey) {
    throw new Error(
      `Config key "${parts.join(".")}" would store a secret value directly. Store the secret with \`wooo-cli secret set <name>\` and configure a *Ref key instead.`,
    );
  }
}

function validateConfigValue(key: string, value: unknown): unknown {
  if (key.toLowerCase().endsWith("ref")) {
    if (typeof value !== "string") {
      throw new Error(`Config key "${key}" must be a secret ref string.`);
    }
    return validateSecretRef(value, key);
  }
  return value;
}

export default defineCommand({
  meta: {
    name: "set",
    description: "Set a configuration value",
  },
  args: {
    key: {
      type: "positional",
      description: "Config key (e.g. default.chain)",
      required: true,
    },
    value: { type: "positional", description: "Config value", required: true },
  },
  run({ args }) {
    ensureConfigDir();
    const configPath = getConfigPath();
    let config: Record<string, unknown> = {};
    if (existsSync(configPath)) {
      config = JSON.parse(readFileSync(configPath, "utf-8"));
    }
    const parts = args.key.split(".");
    assertConfigKeyAllowed(parts);
    const parsedValue = validateConfigValue(
      args.key,
      parseConfigValue(args.key, args.value),
    );
    let current: Record<string, unknown> = config;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in current) || typeof current[parts[i]] !== "object") {
        current[parts[i]] = {};
      }
      current = current[parts[i]] as Record<string, unknown>;
    }
    current[parts[parts.length - 1]] = parsedValue;
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(`Set ${args.key} = ${parsedValue}`);
  },
});
