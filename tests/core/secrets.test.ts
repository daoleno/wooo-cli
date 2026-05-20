import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  getCredentialField,
  getCredentialService,
  requireCredentialField,
  resolveCredentialFieldRef,
  resolveOptionalCredentialField,
} from "../../src/core/credentials";
import {
  checkKeychainSecret,
  checkSecretRef,
  deleteKeychainSecret,
  formatKeychainRef,
  type KeychainStore,
  parseSecretRef,
  requireSecret,
  SecretValue,
  setKeychainSecret,
  setKeychainStoreForTests,
  validateSecretRef,
} from "../../src/core/secrets";

class MemoryKeychainStore implements KeychainStore {
  readonly values = new Map<string, string>();

  async set(account: string, value: string): Promise<void> {
    this.values.set(account, value);
  }

  async get(account: string): Promise<string | null> {
    return this.values.get(account) ?? null;
  }

  async delete(account: string): Promise<boolean> {
    return this.values.delete(account);
  }
}

const ENV_KEY = "WOOO_SECRET_TEST_VALUE";
const originalEnv = {
  [ENV_KEY]: process.env[ENV_KEY],
  WOOO_OKX_API_KEY_REF: process.env.WOOO_OKX_API_KEY_REF,
};

function restoreEnv(): void {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe("secrets", () => {
  let keychain: MemoryKeychainStore;

  beforeEach(() => {
    keychain = new MemoryKeychainStore();
    setKeychainStoreForTests(keychain);
    restoreEnv();
  });

  afterEach(() => {
    setKeychainStoreForTests(null);
    restoreEnv();
  });

  test("parses and normalizes explicit secret refs", () => {
    expect(parseSecretRef("keychain:okx/api-key")).toEqual({
      kind: "keychain",
      value: "okx/api-key",
    });
    expect(parseSecretRef("env:WOOO_SECRET_TEST_VALUE")).toEqual({
      kind: "env",
      value: "WOOO_SECRET_TEST_VALUE",
    });
    expect(validateSecretRef(" keychain:okx/api-secret ")).toBe(
      "keychain:okx/api-secret",
    );
  });

  test("rejects raw env names and invalid refs", () => {
    expect(() => parseSecretRef("WOOO_SECRET_TEST_VALUE")).toThrow(
      /secret ref/,
    );
    expect(() => parseSecretRef("env:not_uppercase")).toThrow(/uppercase/);
    expect(() => parseSecretRef("keychain:../bad")).toThrow(/Invalid/);
  });

  test("resolves env secret refs only when explicitly addressed", async () => {
    process.env[ENV_KEY] = "env-secret";
    const value = await requireSecret(`env:${ENV_KEY}`, "test secret");
    expect(value.reveal()).toBe("env-secret");
    expect(String(value)).toBe("[secret]");
    expect(JSON.stringify({ value })).toBe('{"value":"[secret]"}');
  });

  test("stores, checks, resolves, and deletes keychain secrets", async () => {
    await setKeychainSecret("okx/api-secret", "keychain-secret");

    expect(formatKeychainRef("okx/api-secret")).toBe("keychain:okx/api-secret");
    expect(await checkKeychainSecret("okx/api-secret")).toBe(true);
    expect(await checkSecretRef("keychain:okx/api-secret")).toBe(true);
    expect(
      (
        await requireSecret("keychain:okx/api-secret", "OKX API secret")
      ).reveal(),
    ).toBe("keychain-secret");
    expect(await deleteKeychainSecret("okx/api-secret")).toBe(true);
    expect(await checkKeychainSecret("okx/api-secret")).toBe(false);
  });

  test("errors when a secret ref is missing", async () => {
    await expect(
      requireSecret("keychain:missing", "missing secret"),
    ).rejects.toThrow(/keychain:missing is not set/);
  });

  test("masks SecretValue across string and JSON conversion", () => {
    const secret = new SecretValue({
      label: "test",
      ref: "env:WOOO_SECRET_TEST_VALUE",
      source: "env",
      value: "do-not-print",
    });

    expect(secret.reveal()).toBe("do-not-print");
    expect(`${secret}`).toBe("[secret]");
    expect(JSON.stringify(secret)).toBe('"[secret]"');
  });

  test("credential fields default to canonical keychain slots", async () => {
    const service = getCredentialService("okx-onchain");
    const field = getCredentialField(service, "secret");

    expect(
      resolveCredentialFieldRef({
        config: {},
        field,
        service,
      }),
    ).toEqual({
      field,
      ref: "keychain:okx-onchain/secret",
      source: "default",
    });

    expect(
      await resolveOptionalCredentialField({
        config: {},
        field,
        service,
      }),
    ).toBeUndefined();

    await setKeychainSecret("okx-onchain/secret", "web3-secret");
    expect(
      (
        await requireCredentialField({
          config: {},
          field,
          service,
        })
      ).reveal(),
    ).toBe("web3-secret");
  });

  test("credential services accept only canonical service ids", () => {
    expect(getCredentialService("okx-onchain").id).toBe("okx-onchain");
    expect(() => getCredentialService("okx-dex")).toThrow(
      /Unknown credential service/,
    );
    expect(() => getCredentialService("polymarket")).toThrow(
      /Unknown credential service/,
    );
    expect(() => getCredentialService("li.fi")).toThrow(
      /Unknown credential service/,
    );
  });

  test("credential config refs override defaults without fallback", () => {
    const service = getCredentialService("okx");
    const field = getCredentialField(service, "apiKey");

    expect(
      resolveCredentialFieldRef({
        config: { okx: { apiKeyRef: `env:${ENV_KEY}` } },
        field,
        service,
      }),
    ).toEqual({
      field,
      ref: `env:${ENV_KEY}`,
      source: "config",
    });
  });

  test("credential refs reject duplicate env and config sources", () => {
    process.env.WOOO_OKX_API_KEY_REF = `env:${ENV_KEY}`;

    const service = getCredentialService("okx");
    const field = getCredentialField(service, "apiKey");

    expect(() =>
      resolveCredentialFieldRef({
        config: { okx: { apiKeyRef: "keychain:okx/api-key" } },
        field,
        service,
      }),
    ).toThrow(/configured twice/);

    delete process.env.WOOO_OKX_API_KEY_REF;
  });
});
