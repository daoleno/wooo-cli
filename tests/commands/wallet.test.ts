import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { WalletStore } from "../../src/core/wallet-store";

const TEST_PASSWORD = "test-master-password-32-chars-ok!";

describe("WalletStore", () => {
  let tempDir: string;
  let store: WalletStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "wooo-wallet-test-"));
    store = new WalletStore(tempDir, TEST_PASSWORD);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("generates a new EVM wallet", async () => {
    const wallet = await store.generate("test-wallet", "evm");
    expect(wallet.name).toBe("test-wallet");
    expect(wallet.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(wallet.chain).toBe("evm");
  });

  test("lists wallets", async () => {
    await store.generate("w1", "evm");
    await store.generate("w2", "evm");
    const wallets = await store.list();
    expect(wallets.length).toBe(2);
    expect(wallets.map((w) => w.name)).toContain("w1");
    expect(wallets.map((w) => w.name)).toContain("w2");
  });

  test("imports a wallet from private key", async () => {
    const { generatePrivateKey, privateKeyToAccount } = await import("viem/accounts");
    const pk = generatePrivateKey();
    const account = privateKeyToAccount(pk);
    const wallet = await store.importKey("imported", pk, "evm");
    expect(wallet.address).toBe(account.address);
  });

  test("exports private key", async () => {
    const { generatePrivateKey } = await import("viem/accounts");
    const pk = generatePrivateKey();
    await store.importKey("export-test", pk, "evm");
    const exported = await store.exportKey("export-test");
    expect(exported).toBe(pk);
  });

  test("switches active wallet", async () => {
    await store.generate("w1", "evm");
    await store.generate("w2", "evm");
    await store.setActive("w2");
    const active = await store.getActive();
    expect(active?.name).toBe("w2");
  });
});
