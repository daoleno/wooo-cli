import { loadWoooConfig, type WoooConfig } from "./config";
import {
  checkSecretRef,
  formatKeychainRef,
  readConfigSecretRef,
  readSecretRefEnv,
  requireSecret,
  resolveSecret,
  type SecretValue,
} from "./secrets";

export type CredentialServiceId =
  | "binance"
  | "bybit"
  | "lifi"
  | "okx"
  | "okx-onchain"
  | "polymarket-relayer";

export type CredentialFieldKey =
  | "apiKey"
  | "apiSecret"
  | "passphrase"
  | "secret";

export interface CredentialFieldDefinition {
  arg: string;
  configKey?: string;
  defaultAccount: string;
  envKey?: string;
  key: CredentialFieldKey;
  label: string;
}

export interface CredentialServiceDefinition {
  configSection?: keyof WoooConfig;
  fields: CredentialFieldDefinition[];
  id: CredentialServiceId;
  label: string;
}

export interface ResolvedCredentialFieldRef {
  field: CredentialFieldDefinition;
  ref: string;
  source: "config" | "default" | "env";
}

export const CREDENTIAL_SERVICES: CredentialServiceDefinition[] = [
  {
    id: "okx",
    label: "OKX Exchange",
    configSection: "okx",
    fields: [
      {
        key: "apiKey",
        arg: "api-key",
        label: "OKX API key",
        defaultAccount: "okx/api-key",
        configKey: "apiKeyRef",
        envKey: "WOOO_OKX_API_KEY_REF",
      },
      {
        key: "apiSecret",
        arg: "api-secret",
        label: "OKX API secret",
        defaultAccount: "okx/api-secret",
        configKey: "apiSecretRef",
        envKey: "WOOO_OKX_API_SECRET_REF",
      },
      {
        key: "passphrase",
        arg: "passphrase",
        label: "OKX passphrase",
        defaultAccount: "okx/passphrase",
        configKey: "passphraseRef",
        envKey: "WOOO_OKX_PASSPHRASE_REF",
      },
    ],
  },
  {
    id: "okx-onchain",
    label: "OKX Onchain",
    configSection: "okxOnchain",
    fields: [
      {
        key: "apiKey",
        arg: "api-key",
        label: "OKX Onchain API key",
        defaultAccount: "okx-onchain/api-key",
        configKey: "apiKeyRef",
        envKey: "WOOO_OKX_ONCHAIN_API_KEY_REF",
      },
      {
        key: "secret",
        arg: "secret",
        label: "OKX Onchain secret",
        defaultAccount: "okx-onchain/secret",
        configKey: "secretRef",
        envKey: "WOOO_OKX_ONCHAIN_SECRET_REF",
      },
      {
        key: "passphrase",
        arg: "passphrase",
        label: "OKX Onchain passphrase",
        defaultAccount: "okx-onchain/passphrase",
        configKey: "passphraseRef",
        envKey: "WOOO_OKX_ONCHAIN_PASSPHRASE_REF",
      },
    ],
  },
  {
    id: "binance",
    label: "Binance",
    configSection: "binance",
    fields: [
      {
        key: "apiKey",
        arg: "api-key",
        label: "Binance API key",
        defaultAccount: "binance/api-key",
        configKey: "apiKeyRef",
        envKey: "WOOO_BINANCE_API_KEY_REF",
      },
      {
        key: "apiSecret",
        arg: "api-secret",
        label: "Binance API secret",
        defaultAccount: "binance/api-secret",
        configKey: "apiSecretRef",
        envKey: "WOOO_BINANCE_API_SECRET_REF",
      },
    ],
  },
  {
    id: "bybit",
    label: "Bybit",
    configSection: "bybit",
    fields: [
      {
        key: "apiKey",
        arg: "api-key",
        label: "Bybit API key",
        defaultAccount: "bybit/api-key",
        configKey: "apiKeyRef",
        envKey: "WOOO_BYBIT_API_KEY_REF",
      },
      {
        key: "apiSecret",
        arg: "api-secret",
        label: "Bybit API secret",
        defaultAccount: "bybit/api-secret",
        configKey: "apiSecretRef",
        envKey: "WOOO_BYBIT_API_SECRET_REF",
      },
    ],
  },
  {
    id: "lifi",
    label: "LI.FI",
    configSection: "lifi",
    fields: [
      {
        key: "apiKey",
        arg: "api-key",
        label: "LI.FI API key",
        defaultAccount: "lifi/api-key",
        configKey: "apiKeyRef",
        envKey: "WOOO_LIFI_API_KEY_REF",
      },
    ],
  },
  {
    id: "polymarket-relayer",
    label: "Polymarket relayer",
    configSection: "polymarket",
    fields: [
      {
        key: "apiKey",
        arg: "api-key",
        label: "Polymarket relayer API key",
        defaultAccount: "polymarket/relayer-api-key",
        configKey: "relayerApiKeyRef",
        envKey: "WOOO_POLYMARKET_RELAYER_API_KEY_REF",
      },
    ],
  },
];

export function getCredentialService(
  rawId: string,
): CredentialServiceDefinition {
  const id = rawId.trim().toLowerCase();
  const service = CREDENTIAL_SERVICES.find((candidate) => candidate.id === id);
  if (!service) {
    throw new Error(
      `Unknown credential service "${rawId}". Supported services: ${CREDENTIAL_SERVICES.map((candidate) => candidate.id).join(", ")}.`,
    );
  }
  return service;
}

export function getCredentialField(
  service: CredentialServiceDefinition,
  key: CredentialFieldKey,
): CredentialFieldDefinition {
  const field = service.fields.find((candidate) => candidate.key === key);
  if (!field) {
    throw new Error(
      `${service.label} does not define credential field ${key}.`,
    );
  }
  return field;
}

function getConfigSection(
  config: WoooConfig,
  service: CredentialServiceDefinition,
): Record<string, unknown> | undefined {
  if (!service.configSection) {
    return undefined;
  }
  return config[service.configSection] as Record<string, unknown> | undefined;
}

export function getDefaultCredentialRef(
  field: CredentialFieldDefinition,
): string {
  return formatKeychainRef(field.defaultAccount);
}

export function resolveCredentialFieldRef(params: {
  config: WoooConfig;
  field: CredentialFieldDefinition;
  service: CredentialServiceDefinition;
}): ResolvedCredentialFieldRef {
  const section = getConfigSection(params.config, params.service);
  const envRef = params.field.envKey
    ? readSecretRefEnv(params.field.envKey, params.field.label)
    : undefined;
  const configRef = params.field.configKey
    ? readConfigSecretRef(section, params.field.configKey, params.field.label)
    : undefined;

  if (envRef && configRef) {
    throw new Error(
      `${params.field.label} is configured twice: ${params.field.envKey} and config ${params.field.configKey}. Keep exactly one secret ref.`,
    );
  }

  if (envRef) {
    return { field: params.field, ref: envRef, source: "env" };
  }
  if (configRef) {
    return { field: params.field, ref: configRef, source: "config" };
  }
  return {
    field: params.field,
    ref: getDefaultCredentialRef(params.field),
    source: "default",
  };
}

export async function requireCredentialField(params: {
  config?: WoooConfig;
  field: CredentialFieldDefinition;
  service: CredentialServiceDefinition;
}): Promise<SecretValue> {
  const config = params.config ?? (await loadWoooConfig());
  const resolved = resolveCredentialFieldRef({
    config,
    field: params.field,
    service: params.service,
  });
  return await requireSecret(resolved.ref, params.field.label);
}

export async function resolveOptionalCredentialField(params: {
  config?: WoooConfig;
  field: CredentialFieldDefinition;
  service: CredentialServiceDefinition;
}): Promise<SecretValue | undefined> {
  const config = params.config ?? (await loadWoooConfig());
  const resolved = resolveCredentialFieldRef({
    config,
    field: params.field,
    service: params.service,
  });

  if (resolved.source === "default") {
    try {
      if (!(await checkSecretRef(resolved.ref))) {
        return undefined;
      }
    } catch {
      return undefined;
    }
  }
  return await resolveSecret(resolved.ref, params.field.label);
}

export async function checkCredentialField(params: {
  config?: WoooConfig;
  field: CredentialFieldDefinition;
  service: CredentialServiceDefinition;
}): Promise<{
  present: boolean;
  ref: string;
  source: "config" | "default" | "env";
}> {
  const config = params.config ?? (await loadWoooConfig());
  const resolved = resolveCredentialFieldRef({
    config,
    field: params.field,
    service: params.service,
  });
  return {
    present: await checkSecretRef(resolved.ref),
    ref: resolved.ref,
    source: resolved.source,
  };
}
