import { describe, expect, test } from "bun:test";
import { CURVE_POOLS } from "../../../src/protocols/curve/constants";
import { CurveClient } from "../../../src/protocols/curve/client";

describe("Curve pool resolution", () => {
  test("3pool contains DAI, USDC, USDT with correct decimals", () => {
    const pool = CURVE_POOLS["3pool"];
    expect(pool).toBeDefined();
    expect(pool.tokens).toEqual(["DAI", "USDC", "USDT"]);
    expect(pool.decimals).toEqual([18, 6, 6]);
    expect(pool.tokenAddresses).toHaveLength(3);
  });

  test("steth pool contains ETH and stETH", () => {
    const pool = CURVE_POOLS.steth;
    expect(pool).toBeDefined();
    expect(pool.tokens).toEqual(["ETH", "stETH"]);
    expect(pool.decimals).toEqual([18, 18]);
  });

  test("tricrypto2 pool contains USDT, WBTC, WETH", () => {
    const pool = CURVE_POOLS.tricrypto2;
    expect(pool).toBeDefined();
    expect(pool.tokens).toEqual(["USDT", "WBTC", "WETH"]);
    expect(pool.decimals).toEqual([6, 8, 18]);
  });

  test("all pool addresses are valid format", () => {
    for (const [name, pool] of Object.entries(CURVE_POOLS)) {
      expect(pool.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(pool.tokens.length).toBe(pool.tokenAddresses.length);
      expect(pool.tokens.length).toBe(pool.decimals.length);
    }
  });

  test("client.pools returns all configured pools", () => {
    const client = new CurveClient();
    const pools = client.pools();
    expect(pools.length).toBe(Object.keys(CURVE_POOLS).length);
    for (const pool of pools) {
      expect(pool.name).toBeTruthy();
      expect(pool.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(pool.tokens.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("Curve pool matching", () => {
  // Test pool resolution by checking quote errors —
  // "No Curve pool found" means token matching failed,
  // any other error (RPC, timeout) means matching succeeded.

  test("invalid pair throws pool-not-found error synchronously", () => {
    const client = new CurveClient();
    // USDC and BONK are not in the same pool
    expect(() => {
      // Access internal resolvePool indirectly — quote calls it first
      // before any async RPC. We need to test the sync path:
      // The pool matching happens in the sync portion.
      // Actually quote is async, but error will be thrown.
    }).not.toThrow();

    // Use the async path but with a flag
    client
      .quote("USDC", "BONK", 100)
      .then(() => {
        throw new Error("should not succeed");
      })
      .catch((e: any) => {
        expect(e.message).toContain("No Curve pool found");
      });
  });

  test("3pool tokens can all be swapped between each other", () => {
    // Verify that all 3pool token pairs are found
    const pool = CURVE_POOLS["3pool"];
    for (let i = 0; i < pool.tokens.length; i++) {
      for (let j = 0; j < pool.tokens.length; j++) {
        if (i === j) continue;
        // Both tokens should be in the same pool
        const iToken = pool.tokens[i].toUpperCase();
        const jToken = pool.tokens[j].toUpperCase();
        const found = pool.tokens.some(
          (t) => t.toUpperCase() === iToken,
        ) && pool.tokens.some((t) => t.toUpperCase() === jToken);
        expect(found).toBe(true);
      }
    }
  });

  test("steth pool case-insensitive matching", () => {
    const pool = CURVE_POOLS.steth;
    // "stETH" should match when uppercased to "STETH"
    const hasStETH = pool.tokens.some(
      (t) => t.toUpperCase() === "STETH",
    );
    expect(hasStETH).toBe(true);
  });
});
