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
    store = new WalletStore(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("generates a new EVM wallet", async () => {
    const wallet = await store.generate("test-wallet", "evm", TEST_PASSWORD);
    expect(wallet.name).toBe("test-wallet");
    expect(wallet.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(wallet.chain).toBe("evm");
    expect(wallet.authKind).toBe("local-keystore");
  });

  test("generates a new Solana wallet", async () => {
    const wallet = await store.generate("sol-wallet", "solana", TEST_PASSWORD);
    expect(wallet.name).toBe("sol-wallet");
    expect(() => new PublicKey(wallet.address)).not.toThrow();
    expect(wallet.chain).toBe("solana");
    expect(wallet.authKind).toBe("local-keystore");
  });

  test("lists wallets", async () => {
    await store.generate("w1", "evm", TEST_PASSWORD);
    await store.generate("w2", "evm", TEST_PASSWORD);
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
    const wallet = await store.importKey("imported", pk, "evm", TEST_PASSWORD);
    expect(wallet.address).toBe(account.address);
  });

  test("imports a Solana wallet from secret key", async () => {
    const { Keypair } = await import("@solana/web3.js");
    const keypair = Keypair.generate();
    const secret = bs58.encode(keypair.secretKey);
    const wallet = await store.importKey(
      "solana-imported",
      secret,
      "solana",
      TEST_PASSWORD,
    );
    expect(wallet.address).toBe(keypair.publicKey.toBase58());
    expect(wallet.chain).toBe("solana");
  });

  test("retrieves local secret for local-keystore wallets", async () => {
    const { generatePrivateKey } = await import("viem/accounts");
    const pk = generatePrivateKey();
    await store.importKey("local-secret", pk, "evm", TEST_PASSWORD);
    const secret = await store.getLocalSecret("local-secret", TEST_PASSWORD);
    expect(secret).toBe(pk);
  });

  test("connects an external command wallet", async () => {
    const wallet = await store.connectCommandWallet(
      "external",
      "0x000000000000000000000000000000000000dEaD",
      "evm",
      ["/usr/local/bin/mock-signer", "--profile", "test"],
    );
    expect(wallet.authKind).toBe("command");
  });

  test("connects an external signer service wallet", async () => {
    const wallet = await store.connectServiceWallet(
      "service-wallet",
      "0x000000000000000000000000000000000000dEaD",
      "evm",
      "http://127.0.0.1:8787/",
    );
    expect(wallet.authKind).toBe("service");
  });

  test("switches active wallet", async () => {
    await store.generate("w1", "evm", TEST_PASSWORD);
    await store.generate("w2", "evm", TEST_PASSWORD);
    await store.setActive("w2");
    const active = await store.getActive();
    expect(active?.name).toBe("w2");
  });
});
