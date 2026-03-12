import { describe, expect, test } from "bun:test";
import {
  resolveTokenMint,
  SOLANA_TOKENS,
} from "../../../src/protocols/jupiter/constants";

describe("Jupiter token resolution", () => {
  test("resolves SOL with correct mint and 9 decimals", () => {
    const token = resolveTokenMint("SOL");
    expect(token).toBeDefined();
    expect(token!.mint).toBe("So11111111111111111111111111111111111111112");
    expect(token!.decimals).toBe(9);
  });

  test("resolves USDC with correct mint and 6 decimals", () => {
    const token = resolveTokenMint("USDC");
    expect(token).toBeDefined();
    expect(token!.mint).toBe("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    expect(token!.decimals).toBe(6);
  });

  test("is case-insensitive", () => {
    expect(resolveTokenMint("sol")).toEqual(resolveTokenMint("SOL"));
    expect(resolveTokenMint("usdc")).toEqual(resolveTokenMint("USDC"));
  });

  test("returns undefined for unknown token", () => {
    expect(resolveTokenMint("NONEXISTENT")).toBeUndefined();
  });

  test("all mints are valid base58 strings", () => {
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
    for (const [symbol, info] of Object.entries(SOLANA_TOKENS)) {
      expect(info.mint).toMatch(base58Regex);
      expect(info.decimals).toBeGreaterThanOrEqual(0);
      expect(info.decimals).toBeLessThanOrEqual(18);
    }
  });
});
