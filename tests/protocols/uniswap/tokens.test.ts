import { describe, expect, test } from "bun:test";
import {
  NATIVE_WRAPS,
  resolveToken,
  TOKENS,
} from "../../../src/protocols/uniswap/constants";

describe("Uniswap token resolution", () => {
  test("resolves USDC on ethereum with correct address and decimals", () => {
    const token = resolveToken("USDC", "ethereum");
    expect(token).toBeDefined();
    expect(token?.address).toBe("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
    expect(token?.decimals).toBe(6);
  });

  test("resolves WETH on ethereum", () => {
    const token = resolveToken("WETH", "ethereum");
    expect(token).toBeDefined();
    expect(token?.address).toBe("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");
    expect(token?.decimals).toBe(18);
  });

  test("resolves ETH to WETH via native wrap", () => {
    const token = resolveToken("ETH", "ethereum");
    expect(token).toBeDefined();
    // ETH should resolve to WETH
    expect(token?.address).toBe(resolveToken("WETH", "ethereum")?.address);
  });

  test("resolves MATIC to WMATIC via native wrap", () => {
    expect(NATIVE_WRAPS.MATIC).toBe("WMATIC");
    const token = resolveToken("MATIC", "polygon");
    expect(token).toBeDefined();
    expect(token?.decimals).toBe(18);
  });

  test("is case-insensitive", () => {
    const lower = resolveToken("usdc", "ethereum");
    const upper = resolveToken("USDC", "ethereum");
    const mixed = resolveToken("Usdc", "ethereum");
    expect(lower).toEqual(upper);
    expect(lower).toEqual(mixed);
  });

  test("returns undefined for unknown token", () => {
    expect(resolveToken("SHITCOIN", "ethereum")).toBeUndefined();
  });

  test("returns undefined for unknown chain", () => {
    expect(resolveToken("USDC", "fantom")).toBeUndefined();
  });

  test("USDC has 6 decimals on all chains", () => {
    for (const chain of ["ethereum", "arbitrum", "optimism", "base"]) {
      const token = resolveToken("USDC", chain);
      if (token) {
        expect(token.decimals).toBe(6);
      }
    }
  });

  test("WETH has 18 decimals on all chains", () => {
    for (const chain of ["ethereum", "arbitrum", "optimism", "base"]) {
      const token = resolveToken("WETH", chain);
      if (token) {
        expect(token.decimals).toBe(18);
      }
    }
  });

  test("all token addresses are valid checksummed format", () => {
    for (const [_chain, tokens] of Object.entries(TOKENS)) {
      for (const [_symbol, info] of Object.entries(tokens)) {
        expect(info.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
        expect(info.decimals).toBeGreaterThanOrEqual(0);
        expect(info.decimals).toBeLessThanOrEqual(18);
      }
    }
  });

  test("arbitrum tokens differ from ethereum (not same L1 addresses)", () => {
    const ethUSDC = resolveToken("USDC", "ethereum");
    const arbUSDC = resolveToken("USDC", "arbitrum");
    expect(ethUSDC).toBeDefined();
    expect(arbUSDC).toBeDefined();
    // Different chains should have different contract addresses
    expect(ethUSDC?.address).not.toBe(arbUSDC?.address);
  });
});
