import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { defineCommand } from "citty";
import {
  ensureConfigDir,
  getConfigPath,
  type WoooConfig,
} from "../../core/config";
import {
  type CredentialServiceDefinition,
  getCredentialService,
} from "../../core/credentials";
import {
  formatKeychainRef,
  readSecretFromPrompt,
  setKeychainSecret,
} from "../../core/secrets";

function readConfig(path: string): WoooConfig {
  if (!existsSync(path)) {
    return {};
  }
  return JSON.parse(readFileSync(path, "utf-8")) as WoooConfig;
}

function writeConfigValue(
  sectionName: string,
  key: string,
  value: string,
): void {
  ensureConfigDir();
  const configPath = getConfigPath();
  const config = readConfig(configPath);
  const section =
    typeof config[sectionName] === "object" && config[sectionName] !== null
      ? (config[sectionName] as Record<string, unknown>)
      : {};
  section[key] = value;
  config[sectionName] = section;
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function assertNoUnsupportedCredentialArgs(
  service: CredentialServiceDefinition,
  rawArgs: Record<string, string | undefined>,
): void {
  const allowed = new Set(service.fields.map((field) => field.arg));
  if (service.id === "okx-onchain") {
    allowed.add("project-id");
  }

  for (const key of ["api-key", "api-secret", "secret", "passphrase"]) {
    if (rawArgs[key] !== undefined && !allowed.has(key)) {
      throw new Error(`${service.label} does not use --${key}.`);
    }
  }

  if (rawArgs["project-id"] !== undefined && service.id !== "okx-onchain") {
    throw new Error("--project-id is only valid for okx-onchain.");
  }
}

export default defineCommand({
  meta: {
    name: "set",
    description:
      "Store credentials for a service in the default keychain slots",
  },
  args: {
    service: {
      type: "positional",
      description: "Credential service, for example okx or okx-onchain",
      required: true,
    },
    "api-key": {
      type: "string",
      description: "API key. Omit to enter it interactively.",
    },
    "api-secret": {
      type: "string",
      description: "API secret. Omit to enter it interactively.",
    },
    secret: {
      type: "string",
      description: "Secret key. Omit to enter it interactively.",
    },
    passphrase: {
      type: "string",
      description: "API passphrase. Omit to enter it interactively.",
    },
    "project-id": {
      type: "string",
      description:
        "OKX Onchain/Web3 project ID. Stored as non-secret config when provided.",
    },
  },
  async run({ args }) {
    const service = getCredentialService(args.service);
    const rawArgs = args as Record<string, string | undefined>;
    assertNoUnsupportedCredentialArgs(service, rawArgs);

    for (const field of service.fields) {
      const value =
        rawArgs[field.arg] ?? (await readSecretFromPrompt(`${field.label}:`));
      await setKeychainSecret(field.defaultAccount, value);
      console.log(
        `Stored ${field.label}: ${formatKeychainRef(field.defaultAccount)}`,
      );
    }

    if (service.id === "okx-onchain" && rawArgs["project-id"]?.trim()) {
      writeConfigValue("okxOnchain", "projectId", rawArgs["project-id"].trim());
      console.log("Stored OKX Onchain project ID in config");
    }
  },
});
