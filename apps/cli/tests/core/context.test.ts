import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWallet, getWallet } from "@open-wallet-standard/core";
import { getConfigPath, getVaultPath } from "../../src/core/config";
import { getActiveWallet, getActiveWalletPort } from "../../src/core/context";

describe("context wallet resolution", () => {
  const originalEnv = {
    WOOO_TEST_OWS_PASSPHRASE: process.env.WOOO_TEST_OWS_PASSPHRASE,
    WOOO_OWS_PASSPHRASE_REF: process.env.WOOO_OWS_PASSPHRASE_REF,
    WOOO_CONFIG_DIR: process.env.WOOO_CONFIG_DIR,
    WOOO_WALLET_MODE: process.env.WOOO_WALLET_MODE,
  };

  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "wooo-context-test-"));
    process.env.WOOO_CONFIG_DIR = tempDir;
    process.env.WOOO_OWS_PASSPHRASE_REF = "env:WOOO_TEST_OWS_PASSPHRASE";
    process.env.WOOO_TEST_OWS_PASSPHRASE = "test-passphrase";
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  test("getActiveWalletPort and getActiveWallet honor the requested chain family", async () => {
    const vaultPath = getVaultPath(tempDir);
    createWallet("main", "test-passphrase", 12, vaultPath);
    writeFileSync(
      getConfigPath(tempDir),
      JSON.stringify({
        default: {
          wallet: "main",
          chain: "ethereum",
        },
      }),
    );

    const wallet = getWallet("main", vaultPath);
    const solanaAccount = wallet.accounts.find((account) =>
      account.chainId.startsWith("solana:"),
    );
    const evmAccount = wallet.accounts.find((account) =>
      account.chainId.startsWith("eip155:"),
    );

    const solanaSigner = await getActiveWalletPort("solana");
    const solanaWallet = await getActiveWallet("solana");
    const evmSigner = await getActiveWalletPort("evm");

    expect(solanaSigner.address).toBe(solanaAccount?.address);
    expect(solanaWallet.address).toBe(solanaAccount?.address);
    expect(solanaWallet.chainId.startsWith("solana:")).toBe(true);
    expect(evmSigner.address).toBe(evmAccount?.address);
  });

  test("WOOO_WALLET_MODE=remote requires remote custody and skips local wallets", async () => {
    const vaultPath = getVaultPath(tempDir);
    createWallet("main", "test-passphrase", 12, vaultPath);
    writeFileSync(
      getConfigPath(tempDir),
      JSON.stringify({
        default: {
          wallet: "main",
          chain: "ethereum",
        },
      }),
    );
    writeFileSync(
      join(tempDir, "remote-accounts.json"),
      JSON.stringify({
        accounts: [
          {
            label: "main",
            address: "0x000000000000000000000000000000000000dEaD",
            chainFamily: "evm",
            signerUrl: "http://127.0.0.1:8787/",
          },
        ],
      }),
    );
    process.env.WOOO_WALLET_MODE = "remote";

    const wallet = await getActiveWallet("evm");

    expect(wallet.address).toBe("0x000000000000000000000000000000000000dEaD");
  });

  test("default wallet mode is local and does not fall back to remote accounts", async () => {
    writeFileSync(
      getConfigPath(tempDir),
      JSON.stringify({
        default: {
          wallet: "remote-main",
          chain: "ethereum",
        },
      }),
    );
    writeFileSync(
      join(tempDir, "remote-accounts.json"),
      JSON.stringify({
        accounts: [
          {
            label: "remote-main",
            address: "0x000000000000000000000000000000000000dEaD",
            chainFamily: "evm",
            signerUrl: "http://127.0.0.1:8787/",
          },
        ],
      }),
    );

    await expect(getActiveWallet("evm")).rejects.toThrow(
      /set WOOO_WALLET_MODE=remote/,
    );
  });

  test("WOOO_WALLET_MODE=remote requires explicit remote mode", async () => {
    writeFileSync(
      getConfigPath(tempDir),
      JSON.stringify({
        default: {
          wallet: "remote-main",
          chain: "ethereum",
        },
      }),
    );
    writeFileSync(
      join(tempDir, "remote-accounts.json"),
      JSON.stringify({
        accounts: [
          {
            label: "remote-main",
            address: "0x000000000000000000000000000000000000dEaD",
            chainFamily: "evm",
            signerUrl: "http://127.0.0.1:8787/",
          },
        ],
      }),
    );
    process.env.WOOO_WALLET_MODE = "remote";

    const wallet = await getActiveWallet("evm");

    expect(wallet.address).toBe("0x000000000000000000000000000000000000dEaD");
  });

  test("WOOO_WALLET_MODE=local forbids falling back to remote accounts", async () => {
    writeFileSync(
      getConfigPath(tempDir),
      JSON.stringify({
        default: {
          wallet: "remote-main",
          chain: "ethereum",
        },
      }),
    );
    writeFileSync(
      join(tempDir, "remote-accounts.json"),
      JSON.stringify({
        accounts: [
          {
            label: "remote-main",
            address: "0x000000000000000000000000000000000000dEaD",
            chainFamily: "evm",
            signerUrl: "http://127.0.0.1:8787/",
          },
        ],
      }),
    );
    process.env.WOOO_WALLET_MODE = "local";

    await expect(getActiveWallet("evm")).rejects.toThrow(
      /WOOO_WALLET_MODE=local forbids remote accounts/,
    );
  });

  test("WOOO_WALLET_MODE rejects unsupported values", async () => {
    process.env.WOOO_WALLET_MODE = "auto";

    await expect(getActiveWallet("evm")).rejects.toThrow(
      /WOOO_WALLET_MODE must be "local" or "remote"/,
    );
  });
});
