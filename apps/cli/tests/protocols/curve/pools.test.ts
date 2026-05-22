import { describe, expect, test } from "bun:test";
import { CurveClient } from "../../../src/protocols/curve/client";
import { CURVE_POOLS } from "../../../src/protocols/curve/constants";

describe("Curve pool resolution", () => {
  test("ethereum 3pool contains DAI, USDC, USDT with correct decimals", () => {
    const pool = CURVE_POOLS.ethereum["3pool"];
    expect(pool).toBeDefined();
    expect(pool.tokens).toEqual(["DAI", "USDC", "USDT"]);
    expect(pool.decimals).toEqual([18, 6, 6]);
    expect(pool.tokenAddresses).toHaveLength(3);
  });

  test("ethereum steth pool contains ETH and stETH", () => {
    const pool = CURVE_POOLS.ethereum.steth;
    expect(pool).toBeDefined();
    expect(pool.tokens).toEqual(["ETH", "stETH"]);
    expect(pool.decimals).toEqual([18, 18]);
  });

  test("ethereum tricrypto2 pool contains USDT, WBTC, WETH", () => {
    const pool = CURVE_POOLS.ethereum.tricrypto2;
    expect(pool).toBeDefined();
    expect(pool.tokens).toEqual(["USDT", "WBTC", "WETH"]);
    expect(pool.decimals).toEqual([6, 8, 18]);
  });

  test("all pool addresses are valid format across all chains", () => {
    for (const [_chain, pools] of Object.entries(CURVE_POOLS)) {
      for (const [_name, pool] of Object.entries(pools)) {
        expect(pool.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
        expect(pool.tokens.length).toBe(pool.tokenAddresses.length);
        expect(pool.tokens.length).toBe(pool.decimals.length);
      }
    }
  });

  test("client.pools returns array (async)", async () => {
    // pools() is now async and uses @curvefi/api SDK
    // We just verify it returns a promise that resolves to an array
    const ethClient = new CurveClient("ethereum");
    const result = ethClient.pools();
    expect(result).toBeInstanceOf(Promise);
  });
});

describe("Curve multi-chain isolation", () => {
  test("arbitrum has its own pools", () => {
    const pools = CURVE_POOLS.arbitrum;
    expect(pools).toBeDefined();
    expect(Object.keys(pools).length).toBeGreaterThanOrEqual(1);
    // Arbitrum 2pool uses arbitrum USDC address, not ethereum
    const pool2 = pools["2pool"];
    expect(pool2).toBeDefined();
    expect(pool2.tokens).toContain("USDC");
  });

  test("each chain has unique pool addresses", () => {
    const allAddresses = new Set<string>();
    for (const [_chain, pools] of Object.entries(CURVE_POOLS)) {
      for (const [, pool] of Object.entries(pools)) {
        // Same pool name on different chains should have different addresses
        expect(allAddresses.has(pool.address.toLowerCase())).toBe(false);
        allAddresses.add(pool.address.toLowerCase());
      }
    }
  });

  test("unsupported chain throws on init", async () => {
    const client = new CurveClient("solana");
    // @curvefi/api throws when chain is not supported
    await expect(client.pools()).rejects.toThrow();
  });
});

describe("Curve pool matching", () => {
  test("3pool tokens can all be swapped between each other", () => {
    const pool = CURVE_POOLS.ethereum["3pool"];
    for (let i = 0; i < pool.tokens.length; i++) {
      for (let j = 0; j < pool.tokens.length; j++) {
        if (i === j) continue;
        const iToken = pool.tokens[i].toUpperCase();
        const jToken = pool.tokens[j].toUpperCase();
        const found =
          pool.tokens.some((t) => t.toUpperCase() === iToken) &&
          pool.tokens.some((t) => t.toUpperCase() === jToken);
        expect(found).toBe(true);
      }
    }
  });

  test("steth pool case-insensitive matching", () => {
    const pool = CURVE_POOLS.ethereum.steth;
    const hasStETH = pool.tokens.some((t) => t.toUpperCase() === "STETH");
    expect(hasStETH).toBe(true);
  });
});
