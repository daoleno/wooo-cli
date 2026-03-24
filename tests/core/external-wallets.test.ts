import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  RemoteAccountRegistry,
  type RemoteAccountRecord,
} from "../../src/core/external-wallets";

const EVM_ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const SOL_ADDRESS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

describe("RemoteAccountRegistry", () => {
  let tempDir: string;
  let registry: RemoteAccountRegistry;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "wooo-test-external-wallets-"));
    registry = new RemoteAccountRegistry(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("add and list wallets", () => {
    const wallet: RemoteAccountRecord = {
      label: "my-ledger",
      address: EVM_ADDRESS,
      chainFamily: "evm",
      signerUrl: "http://127.0.0.1:8787/",
    };

    registry.add(wallet);
    const wallets = registry.list();

    expect(wallets).toHaveLength(1);
    expect(wallets[0]).toEqual(wallet);
  });

  test("list returns multiple wallets", () => {
    const evmWallet: RemoteAccountRecord = {
      label: "hw-evm",
      address: EVM_ADDRESS,
      chainFamily: "evm",
      signerUrl: "http://localhost:8080/",
    };
    const solWallet: RemoteAccountRecord = {
      label: "hw-sol",
      address: SOL_ADDRESS,
      chainFamily: "solana",
      signerUrl: "http://localhost:9090/",
      authEnv: "WOOO_SIGNER_AUTH_TOKEN",
    };

    registry.add(evmWallet);
    registry.add(solWallet);

    const wallets = registry.list();
    expect(wallets).toHaveLength(2);
    expect(wallets.map((w) => w.label)).toContain("hw-evm");
    expect(wallets.map((w) => w.label)).toContain("hw-sol");
  });

  test("get wallet by name", () => {
    const wallet: RemoteAccountRecord = {
      label: "remote-signer",
      address: EVM_ADDRESS,
      chainFamily: "evm",
      signerUrl: "http://localhost:7777/",
    };

    registry.add(wallet);
    const found = registry.get("remote-signer");

    expect(found).toEqual(wallet);
  });

  test("get returns undefined for unknown wallet", () => {
    const result = registry.get("nonexistent");
    expect(result).toBeUndefined();
  });

  test("remove wallet", () => {
    const wallet: RemoteAccountRecord = {
      label: "to-remove",
      address: EVM_ADDRESS,
      chainFamily: "evm",
      signerUrl: "http://127.0.0.1:8787/",
    };

    registry.add(wallet);
    expect(registry.list()).toHaveLength(1);

    registry.remove("to-remove");
    expect(registry.list()).toHaveLength(0);
  });

  test("throws on duplicate name", () => {
    const wallet: RemoteAccountRecord = {
      label: "duplicate",
      address: EVM_ADDRESS,
      chainFamily: "evm",
      signerUrl: "http://127.0.0.1:8787/",
    };

    registry.add(wallet);
    expect(() => registry.add({ ...wallet })).toThrow(/already exists/i);
  });

  test("throws on removing unknown wallet", () => {
    expect(() => registry.remove("ghost")).toThrow(/not found/i);
  });

  test("rejects non-signer auth env names", () => {
    expect(() =>
      registry.add({
        label: "invalid-auth-env",
        address: EVM_ADDRESS,
        chainFamily: "evm",
        signerUrl: "http://127.0.0.1:8787/",
        authEnv: "OPENAI_API_KEY",
      }),
    ).toThrow(/WOOO_SIGNER_AUTH_/);
  });

  test("creates the config directory on first save", () => {
    const missingDir = join(tempDir, "nested", "config");
    const nestedRegistry = new RemoteAccountRegistry(missingDir);

    nestedRegistry.add({
      label: "first-wallet",
      address: EVM_ADDRESS,
      chainFamily: "evm",
      signerUrl: "http://127.0.0.1:8787/",
    });

    expect(nestedRegistry.list()).toHaveLength(1);
  });
});
