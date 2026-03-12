import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
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

  test("generates a new Solana wallet", async () => {
    const wallet = await store.generate("sol-wallet", "solana");
    expect(wallet.name).toBe("sol-wallet");
    expect(() => new PublicKey(wallet.address)).not.toThrow();
    expect(wallet.chain).toBe("solana");
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
    const { generatePrivateKey, privateKeyToAccount } = await import(
      "viem/accounts"
    );
    const pk = generatePrivateKey();
    const account = privateKeyToAccount(pk);
    const wallet = await store.importKey("imported", pk, "evm");
    expect(wallet.address).toBe(account.address);
  });

  test("imports a Solana wallet from secret key", async () => {
    const { Keypair } = await import("@solana/web3.js");
    const keypair = Keypair.generate();
    const secret = bs58.encode(keypair.secretKey);
    const wallet = await store.importKey("solana-imported", secret, "solana");
    expect(wallet.address).toBe(keypair.publicKey.toBase58());
    expect(wallet.chain).toBe("solana");
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
