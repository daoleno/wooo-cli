import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWallet, getWallet } from "@open-wallet-standard/core";
import { getConfigPath, getVaultPath } from "../../src/core/config";
import { getActiveSigner, getActiveWallet } from "../../src/core/context";

describe("context wallet resolution", () => {
  const originalEnv = {
    OWS_PASSPHRASE: process.env.OWS_PASSPHRASE,
    WOOO_CONFIG_DIR: process.env.WOOO_CONFIG_DIR,
  };

  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "wooo-context-test-"));
    process.env.WOOO_CONFIG_DIR = tempDir;
    process.env.OWS_PASSPHRASE = "test-passphrase";
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

  test("getActiveSigner and getActiveWallet honor the requested chain family", async () => {
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

    const solanaSigner = await getActiveSigner("solana");
    const solanaWallet = await getActiveWallet("solana");
    const evmSigner = await getActiveSigner("evm");

    expect(solanaSigner.address).toBe(solanaAccount?.address);
    expect(solanaWallet.address).toBe(solanaAccount?.address);
    expect(solanaWallet.chainId.startsWith("solana:")).toBe(true);
    expect(evmSigner.address).toBe(evmAccount?.address);
  });
});
