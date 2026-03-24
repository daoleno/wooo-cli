import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ExternalWalletRegistry } from "../../src/core/external-wallets";

describe("ExternalWalletRegistry (via wallet commands)", () => {
  let tempDir: string;
  let registry: ExternalWalletRegistry;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "wooo-wallet-test-"));
    registry = new ExternalWalletRegistry(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("starts with an empty list", () => {
    expect(registry.list()).toEqual([]);
  });

  test("adds and lists an external wallet", () => {
    registry.add({
      name: "http-wallet",
      address: "0x000000000000000000000000000000000000dEaD",
      chainType: "evm",
      broker: "http://127.0.0.1:8787/",
    });
    const wallets = registry.list();
    expect(wallets).toHaveLength(1);
    expect(wallets[0]?.name).toBe("http-wallet");
    expect(wallets[0]?.broker).toBe("http://127.0.0.1:8787/");
  });

  test("adds and lists an external wallet with auth", () => {
    registry.add({
      name: "auth-wallet",
      address: "0x000000000000000000000000000000000000dEaD",
      chainType: "evm",
      broker: "https://broker.example.com/",
      authEnv: "WOOO_BROKER_TOKEN",
    });
    const wallets = registry.list();
    expect(wallets).toHaveLength(1);
    expect(wallets[0]?.name).toBe("auth-wallet");
    expect(wallets[0]?.broker).toBe("https://broker.example.com/");
    expect(wallets[0]?.authEnv).toBe("WOOO_BROKER_TOKEN");
  });

  test("retrieves a wallet by name", () => {
    registry.add({
      name: "my-wallet",
      address: "0x000000000000000000000000000000000000dEaD",
      chainType: "evm",
      broker: "http://127.0.0.1:8787/",
    });
    const wallet = registry.get("my-wallet");
    expect(wallet).toBeDefined();
    expect(wallet?.name).toBe("my-wallet");
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  test("removes a wallet by name", () => {
    registry.add({
      name: "to-remove",
      address: "0x000000000000000000000000000000000000dEaD",
      chainType: "evm",
      broker: "http://127.0.0.1:8787/",
    });
    expect(registry.list()).toHaveLength(1);
    registry.remove("to-remove");
    expect(registry.list()).toHaveLength(0);
  });

  test("persists wallets across instances", () => {
    registry.add({
      name: "persistent",
      address: "0x000000000000000000000000000000000000dEaD",
      chainType: "evm",
      broker: "http://127.0.0.1:9999/",
    });

    const registry2 = new ExternalWalletRegistry(tempDir);
    expect(registry2.list()).toHaveLength(1);
    expect(registry2.get("persistent")?.broker).toBe(
      "http://127.0.0.1:9999/",
    );
  });
});
