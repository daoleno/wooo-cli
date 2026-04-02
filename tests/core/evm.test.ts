import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CHAIN_MAP,
  EVM_LOCAL_RPC_TIMEOUT_MS,
  EVM_RPC_RETRY_COUNT,
  EVM_RPC_TIMEOUT_MS,
  getChain,
  getPublicClient,
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

  test("resolves ethereum aliases", () => {
    expect(getChain("eth").id).toBe(1);
    expect(getChain("mainnet").id).toBe(1);
  });

  test("resolves arbitrum", () => {
    const chain = getChain("arbitrum");
    expect(chain.id).toBe(42161);
  });

  test("resolves arbitrum alias", () => {
    expect(getChain("arb").id).toBe(42161);
  });

  test("resolves optimism", () => {
    const chain = getChain("optimism");
    expect(chain.id).toBe(10);
  });

  test("resolves optimism alias", () => {
    expect(getChain("op").id).toBe(10);
  });

  test("resolves polygon", () => {
    const chain = getChain("polygon");
    expect(chain.id).toBe(137);
  });

  test("resolves polygon alias", () => {
    expect(getChain("matic").id).toBe(137);
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

  test("ships defaults for every supported EVM chain", () => {
    expect(getRpcUrlForChain("ethereum")).toBe("https://1rpc.io/eth");
    expect(getRpcUrlForChain("arbitrum")).toBe("https://arb1.arbitrum.io/rpc");
    expect(getRpcUrlForChain("optimism")).toBe("https://mainnet.optimism.io");
    expect(getRpcUrlForChain("polygon")).toBe(
      "https://polygon-bor-rpc.publicnode.com",
    );
    expect(getRpcUrlForChain("base")).toBe("https://mainnet.base.org");
  });

  test("configures public clients to fail fast on bad RPCs", () => {
    const client = getPublicClient("ethereum");
    expect(client.transport.retryCount).toBe(EVM_RPC_RETRY_COUNT);
    expect(client.transport.timeout).toBe(EVM_RPC_TIMEOUT_MS);
  });

  test("uses a longer timeout for local fork RPCs", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "wooo-evm-config-"));
    try {
      writeFileSync(
        join(tempDir, "wooo.config.json"),
        JSON.stringify({
          chains: {
            ethereum: { rpc: "http://127.0.0.1:8545" },
          },
        }),
      );
      process.env.WOOO_CONFIG_DIR = tempDir;

      const client = getPublicClient("ethereum");
      expect(client.transport.retryCount).toBe(EVM_RPC_RETRY_COUNT);
      expect(client.transport.timeout).toBe(EVM_LOCAL_RPC_TIMEOUT_MS);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
