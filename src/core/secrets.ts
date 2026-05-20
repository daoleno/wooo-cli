import { password } from "@clack/prompts";

const DEFAULT_KEYCHAIN_SERVICE = "wooo-cli";
const SECRET_REF_PATTERN = /^(keychain|env):(.+)$/;
const ENV_REF_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const KEYCHAIN_ACCOUNT_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._/@:-]*$/;

export type SecretRefKind = "env" | "keychain";

export interface ParsedSecretRef {
  kind: SecretRefKind;
  value: string;
}

export interface KeychainStore {
  delete(account: string): Promise<boolean>;
  get(account: string): Promise<string | null>;
  set(account: string, value: string): Promise<void>;
}

export class SecretValue {
  readonly ref: string;
  readonly label: string;
  readonly source: SecretRefKind;
  #value: string;

  constructor(params: {
    label: string;
    ref: string;
    source: SecretRefKind;
    value: string;
  }) {
    this.label = params.label;
    this.ref = params.ref;
    this.source = params.source;
    this.#value = params.value;
  }

  reveal(): string {
    return this.#value;
  }

  toJSON(): string {
    return "[secret]";
  }

  toString(): string {
    return "[secret]";
  }
}

let keychainStoreOverride: KeychainStore | null = null;

class OsKeychainStore implements KeychainStore {
  async set(account: string, value: string): Promise<void> {
    const { AsyncEntry } = await import("@napi-rs/keyring");
    await new AsyncEntry(DEFAULT_KEYCHAIN_SERVICE, account).setPassword(value);
  }

  async get(account: string): Promise<string | null> {
    const { AsyncEntry } = await import("@napi-rs/keyring");
    return (
      (await new AsyncEntry(DEFAULT_KEYCHAIN_SERVICE, account).getPassword()) ??
      null
    );
  }

  async delete(account: string): Promise<boolean> {
    const { AsyncEntry } = await import("@napi-rs/keyring");
    return Boolean(
      await new AsyncEntry(
        DEFAULT_KEYCHAIN_SERVICE,
        account,
      ).deleteCredential(),
    );
  }
}

function getKeychainStore(): KeychainStore {
  return keychainStoreOverride ?? new OsKeychainStore();
}

export function setKeychainStoreForTests(store: KeychainStore | null): void {
  keychainStoreOverride = store;
}

export function formatKeychainRef(account: string): string {
  return `keychain:${normalizeKeychainAccount(account)}`;
}

export function normalizeKeychainAccount(account: string): string {
  const normalized = account.trim();
  if (!normalized) {
    throw new Error("Secret keychain account cannot be empty.");
  }
  if (!KEYCHAIN_ACCOUNT_PATTERN.test(normalized)) {
    throw new Error(
      `Invalid keychain secret name "${account}". Use letters, numbers, dot, underscore, slash, at, colon, or dash.`,
    );
  }
  return normalized;
}

export function parseSecretRef(ref: string, label = "secret"): ParsedSecretRef {
  const normalized = ref.trim();
  const match = SECRET_REF_PATTERN.exec(normalized);
  if (!match) {
    throw new Error(
      `${label} must be a secret ref using keychain:<name> or env:<ENV_NAME>.`,
    );
  }

  const kind = match[1] as SecretRefKind;
  const value = match[2]?.trim() ?? "";
  if (!value) {
    throw new Error(`${label} secret ref is missing a value.`);
  }

  if (kind === "keychain") {
    return { kind, value: normalizeKeychainAccount(value) };
  }

  if (!ENV_REF_NAME_PATTERN.test(value)) {
    throw new Error(
      `${label} env secret ref must use an uppercase env name, received "${value}".`,
    );
  }
  return { kind, value };
}

export function validateSecretRef(
  ref: string | undefined,
  label = "secret",
): string | undefined {
  if (!ref) {
    return undefined;
  }
  const parsed = parseSecretRef(ref, label);
  return `${parsed.kind}:${parsed.value}`;
}

export function readSecretRefEnv(
  envKey: string,
  label = envKey,
): string | undefined {
  const value = process.env[envKey]?.trim();
  return value ? validateSecretRef(value, label) : undefined;
}

export async function resolveSecret(
  ref: string | undefined,
  label = "secret",
): Promise<SecretValue | undefined> {
  if (!ref) {
    return undefined;
  }

  const parsed = parseSecretRef(ref, label);
  const normalizedRef = `${parsed.kind}:${parsed.value}`;
  let value: string | null;
  if (parsed.kind === "env") {
    value = process.env[parsed.value] ?? null;
  } else {
    value = await getKeychainStore().get(parsed.value);
  }

  if (!value?.trim()) {
    throw new Error(`${label} secret ${normalizedRef} is not set or is empty.`);
  }

  return new SecretValue({
    label,
    ref: normalizedRef,
    source: parsed.kind,
    value,
  });
}

export async function requireSecret(
  ref: string | undefined,
  label = "secret",
): Promise<SecretValue> {
  const value = await resolveSecret(ref, label);
  if (!value) {
    throw new Error(`${label} secret ref is required.`);
  }
  return value;
}

export function readConfigSecretRef(
  config: Record<string, unknown> | undefined,
  key: string,
  label: string,
): string | undefined {
  const value = config?.[key];
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`${label} config value must be a secret ref string.`);
  }
  return validateSecretRef(value, label);
}

export async function setKeychainSecret(
  account: string,
  value: string,
): Promise<string> {
  const normalized = normalizeKeychainAccount(account);
  if (!value.trim()) {
    throw new Error("Secret value cannot be empty.");
  }
  await getKeychainStore().set(normalized, value);
  return formatKeychainRef(normalized);
}

export async function readSecretFromPrompt(label: string): Promise<string> {
  const result = await password({
    message: label,
  });

  if (typeof result === "symbol") {
    throw new Error("Secret input was cancelled.");
  }

  if (!result.trim()) {
    throw new Error("Secret value cannot be empty.");
  }

  return result;
}

export async function checkKeychainSecret(account: string): Promise<boolean> {
  const normalized = normalizeKeychainAccount(account);
  const value = await getKeychainStore().get(normalized);
  return Boolean(value?.trim());
}

export async function checkSecretRef(ref: string): Promise<boolean> {
  const parsed = parseSecretRef(ref);
  if (parsed.kind === "env") {
    return Boolean(process.env[parsed.value]?.trim());
  }
  return await checkKeychainSecret(parsed.value);
}

export async function deleteKeychainSecret(account: string): Promise<boolean> {
  const normalized = normalizeKeychainAccount(account);
  return await getKeychainStore().delete(normalized);
}

export function getSecretStorageDescription(): string {
  return `${DEFAULT_KEYCHAIN_SERVICE} OS keychain`;
}
