import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RemoteAccountRegistry } from "../../src/core/external-wallets";

describe("RemoteAccountRegistry (via wallet commands)", () => {
  let tempDir: string;
  let registry: RemoteAccountRegistry;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "wooo-wallet-test-"));
    registry = new RemoteAccountRegistry(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("starts with an empty list", () => {
    expect(registry.list()).toEqual([]);
  });

  test("adds and lists a remote account", () => {
    registry.add({
      label: "http-wallet",
      address: "0x000000000000000000000000000000000000dEaD",
      chainFamily: "evm",
      signerUrl: "http://127.0.0.1:8787/",
    });
    const wallets = registry.list();
    expect(wallets).toHaveLength(1);
    expect(wallets[0]?.label).toBe("http-wallet");
    expect(wallets[0]?.signerUrl).toBe("http://127.0.0.1:8787/");
  });

  test("adds and lists a remote account with auth", () => {
    registry.add({
      label: "auth-wallet",
      address: "0x000000000000000000000000000000000000dEaD",
      chainFamily: "evm",
      signerUrl: "https://signer.example.com/",
      authEnv: "WOOO_SIGNER_AUTH_TOKEN",
    });
    const wallets = registry.list();
    expect(wallets).toHaveLength(1);
    expect(wallets[0]?.label).toBe("auth-wallet");
    expect(wallets[0]?.signerUrl).toBe("https://signer.example.com/");
    expect(wallets[0]?.authEnv).toBe("WOOO_SIGNER_AUTH_TOKEN");
  });

  test("retrieves a wallet by name", () => {
    registry.add({
      label: "my-wallet",
      address: "0x000000000000000000000000000000000000dEaD",
      chainFamily: "evm",
      signerUrl: "http://127.0.0.1:8787/",
    });
    const wallet = registry.get("my-wallet");
    expect(wallet).toBeDefined();
    expect(wallet?.label).toBe("my-wallet");
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  test("removes a wallet by name", () => {
    registry.add({
      label: "to-remove",
      address: "0x000000000000000000000000000000000000dEaD",
      chainFamily: "evm",
      signerUrl: "http://127.0.0.1:8787/",
    });
    expect(registry.list()).toHaveLength(1);
    registry.remove("to-remove");
    expect(registry.list()).toHaveLength(0);
  });

  test("persists wallets across instances", () => {
    registry.add({
      label: "persistent",
      address: "0x000000000000000000000000000000000000dEaD",
      chainFamily: "evm",
      signerUrl: "http://127.0.0.1:9999/",
    });

    const registry2 = new RemoteAccountRegistry(tempDir);
    expect(registry2.list()).toHaveLength(1);
    expect(registry2.get("persistent")?.signerUrl).toBe(
      "http://127.0.0.1:9999/",
    );
  });
});
