import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CHAIN_MAP,
  getAccountAddress,
  getChain,
  getRpcUrlForChain,
} from "../../src/core/evm";

const originalConfigDir = process.env.WOOO_CONFIG_DIR;

afterEach(() => {
  if (originalConfigDir === undefined) {
    delete process.env.WOOO_CONFIG_DIR;
  } else {
    process.env.WOOO_CONFIG_DIR = originalConfigDir;
  }
});

describe("EVM chain resolution", () => {
  test("resolves ethereum to mainnet chain", () => {
    const chain = getChain("ethereum");
    expect(chain.id).toBe(1);
    expect(chain.name).toBe("Ethereum");
  });

  test("resolves arbitrum", () => {
    const chain = getChain("arbitrum");
    expect(chain.id).toBe(42161);
  });

  test("resolves optimism", () => {
    const chain = getChain("optimism");
    expect(chain.id).toBe(10);
  });

  test("resolves polygon", () => {
    const chain = getChain("polygon");
    expect(chain.id).toBe(137);
  });

  test("resolves base", () => {
    const chain = getChain("base");
    expect(chain.id).toBe(8453);
  });

  test("all supported chains have unique IDs", () => {
    const ids = new Set<number>();
    for (const [_name, chain] of Object.entries(CHAIN_MAP)) {
      expect(ids.has(chain.id)).toBe(false);
      ids.add(chain.id);
    }
  });

  test("unsupported chain calls process.exit", () => {
    const originalExit = process.exit;
    let exitCode: number | undefined;
    process.exit = ((code?: number) => {
      exitCode = code;
      throw new Error("process.exit called");
    }) as typeof process.exit;

    try {
      getChain("solana"); // Not an EVM chain
    } catch {
      // expected
    }
    expect(exitCode).toBe(2);
    process.exit = originalExit;
  });

  test("uses configured RPC override when present", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "wooo-evm-config-"));
    try {
      writeFileSync(
        join(tempDir, "wooo.config.json"),
        JSON.stringify({
          chains: {
            arbitrum: { rpc: "https://example.invalid/arbitrum" },
          },
        }),
      );
      process.env.WOOO_CONFIG_DIR = tempDir;
      expect(getRpcUrlForChain("arbitrum")).toBe(
        "https://example.invalid/arbitrum",
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("EVM account address derivation", () => {
  test("derives correct address from known private key", () => {
    // Well-known test private key (DO NOT use with real funds)
    const testPK =
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    const address = getAccountAddress(testPK);
    expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    // Hardhat #0 account
    expect(address.toLowerCase()).toBe(
      "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
    );
  });

  test("different private keys produce different addresses", () => {
    const pk1 =
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    const pk2 =
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
    expect(getAccountAddress(pk1)).not.toBe(getAccountAddress(pk2));
  });
});
