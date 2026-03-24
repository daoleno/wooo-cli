import { describe, expect, test } from "bun:test";
import {
  evmChainArg,
  formatSupportedChains,
  getChainFamily,
  normalizeChainName,
  resolveChainId,
} from "../../src/core/chain-ids";

describe("resolveChainId()", () => {
  test("resolves 'base' to eip155:8453", () => {
    expect(resolveChainId("base")).toBe("eip155:8453");
  });

  test("resolves 'eth' alias to eip155:1", () => {
    expect(resolveChainId("eth")).toBe("eip155:1");
  });

  test("resolves 'ethereum' to eip155:1", () => {
    expect(resolveChainId("ethereum")).toBe("eip155:1");
  });

  test("resolves 'arb' alias to eip155:42161", () => {
    expect(resolveChainId("arb")).toBe("eip155:42161");
  });

  test("resolves 'arbitrum' to eip155:42161", () => {
    expect(resolveChainId("arbitrum")).toBe("eip155:42161");
  });

  test("resolves 'op' alias to eip155:10", () => {
    expect(resolveChainId("op")).toBe("eip155:10");
  });

  test("resolves 'optimism' to eip155:10", () => {
    expect(resolveChainId("optimism")).toBe("eip155:10");
  });

  test("resolves 'matic' alias to eip155:137", () => {
    expect(resolveChainId("matic")).toBe("eip155:137");
  });

  test("resolves 'polygon' to eip155:137", () => {
    expect(resolveChainId("polygon")).toBe("eip155:137");
  });

  test("resolves 'sol' alias to solana mainnet CAIP-2", () => {
    expect(resolveChainId("sol")).toBe(
      "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    );
  });

  test("resolves 'solana' to solana mainnet CAIP-2", () => {
    expect(resolveChainId("solana")).toBe(
      "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    );
  });

  test("passes through a valid CAIP-2 eip155 chain ID as-is", () => {
    expect(resolveChainId("eip155:1")).toBe("eip155:1");
  });

  test("passes through a valid CAIP-2 solana chain ID as-is", () => {
    expect(resolveChainId("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp")).toBe(
      "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    );
  });

  test("passes through an arbitrary valid CAIP-2 chain ID as-is", () => {
    expect(resolveChainId("eip155:42161")).toBe("eip155:42161");
  });

  test("throws on unknown chain name", () => {
    expect(() => resolveChainId("unknownchain")).toThrow();
  });

  test("throws on empty string", () => {
    expect(() => resolveChainId("")).toThrow();
  });
});

describe("getChainFamily()", () => {
  test("returns 'evm' for eip155:1", () => {
    expect(getChainFamily("eip155:1")).toBe("evm");
  });

  test("returns 'evm' for eip155:42161", () => {
    expect(getChainFamily("eip155:42161")).toBe("evm");
  });

  test("returns 'evm' for eip155:8453", () => {
    expect(getChainFamily("eip155:8453")).toBe("evm");
  });

  test("returns 'solana' for solana mainnet CAIP-2", () => {
    expect(getChainFamily("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp")).toBe(
      "solana",
    );
  });

  test("throws on unsupported namespace", () => {
    expect(() => getChainFamily("cosmos:cosmoshub-4")).toThrow();
  });

  test("throws on malformed CAIP-2 (no colon)", () => {
    expect(() => getChainFamily("eip155")).toThrow();
  });
});

describe("normalizeChainName()", () => {
  test("normalizes 'eth' to 'ethereum'", () => {
    expect(normalizeChainName("eth")).toBe("ethereum");
  });

  test("normalizes 'arb' to 'arbitrum'", () => {
    expect(normalizeChainName("arb")).toBe("arbitrum");
  });

  test("normalizes 'op' to 'optimism'", () => {
    expect(normalizeChainName("op")).toBe("optimism");
  });

  test("normalizes 'matic' to 'polygon'", () => {
    expect(normalizeChainName("matic")).toBe("polygon");
  });

  test("normalizes 'sol' to 'solana'", () => {
    expect(normalizeChainName("sol")).toBe("solana");
  });

  test("normalizes 'mainnet' to 'ethereum'", () => {
    expect(normalizeChainName("mainnet")).toBe("ethereum");
  });

  test("passes through known chain names unchanged", () => {
    expect(normalizeChainName("ethereum")).toBe("ethereum");
    expect(normalizeChainName("arbitrum")).toBe("arbitrum");
    expect(normalizeChainName("base")).toBe("base");
    expect(normalizeChainName("solana")).toBe("solana");
  });

  test("trims and lowercases input", () => {
    expect(normalizeChainName("  ETH  ")).toBe("ethereum");
    expect(normalizeChainName("Ethereum")).toBe("ethereum");
  });
});

describe("evmChainArg()", () => {
  test("returns a Citty arg descriptor with type string", () => {
    const arg = evmChainArg();
    expect(arg.type).toBe("string");
  });

  test("returns a descriptor with a description string", () => {
    const arg = evmChainArg();
    expect(typeof arg.description).toBe("string");
    expect(arg.description.length).toBeGreaterThan(0);
  });

  test("defaults to 'ethereum' when no argument given", () => {
    const arg = evmChainArg();
    expect(arg.default).toBe("ethereum");
  });

  test("accepts a custom default chain", () => {
    const arg = evmChainArg("base");
    expect(arg.default).toBe("base");
  });
});

describe("formatSupportedChains()", () => {
  test("formats chains that have aliases with alias in parentheses", () => {
    const result = formatSupportedChains(["ethereum", "arbitrum"]);
    expect(result).toContain("ethereum");
    expect(result).toContain("eth");
    expect(result).toContain("arbitrum");
    expect(result).toContain("arb");
  });

  test("formats chains without aliases as plain names", () => {
    const result = formatSupportedChains(["base"]);
    expect(result).toContain("base");
  });

  test("joins multiple chains with a separator", () => {
    const result = formatSupportedChains(["ethereum", "base"]);
    expect(result).toContain("ethereum");
    expect(result).toContain("base");
    // Should contain some separator between multiple chains
    expect(result.length).toBeGreaterThan("ethereum".length + "base".length);
  });

  test("handles empty list", () => {
    expect(formatSupportedChains([])).toBe("");
  });
});
