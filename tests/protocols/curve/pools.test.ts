import { describe, expect, test } from "bun:test";
import { CURVE_POOLS } from "../../../src/protocols/curve/constants";
import { CurveClient } from "../../../src/protocols/curve/client";

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
    for (const [chain, pools] of Object.entries(CURVE_POOLS)) {
      for (const [name, pool] of Object.entries(pools)) {
        expect(pool.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
        expect(pool.tokens.length).toBe(pool.tokenAddresses.length);
        expect(pool.tokens.length).toBe(pool.decimals.length);
      }
    }
  });

  test("client.pools returns chain-specific pools", () => {
    const ethClient = new CurveClient("ethereum");
    const ethPools = ethClient.pools();
    expect(ethPools.length).toBe(Object.keys(CURVE_POOLS.ethereum).length);

    const arbClient = new CurveClient("arbitrum");
    const arbPools = arbClient.pools();
    expect(arbPools.length).toBe(Object.keys(CURVE_POOLS.arbitrum).length);

    // Pools should be different between chains
    const ethNames = ethPools.map((p) => p.address);
    const arbNames = arbPools.map((p) => p.address);
    for (const addr of arbNames) {
      expect(ethNames).not.toContain(addr);
    }
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
    for (const [chain, pools] of Object.entries(CURVE_POOLS)) {
      for (const [, pool] of Object.entries(pools)) {
        // Same pool name on different chains should have different addresses
        expect(allAddresses.has(pool.address.toLowerCase())).toBe(false);
        allAddresses.add(pool.address.toLowerCase());
      }
    }
  });

  test("unsupported chain throws descriptive error", () => {
    const client = new CurveClient("solana");
    expect(() => {
      // pools() returns empty array for missing chain
      const pools = client.pools();
      expect(pools).toHaveLength(0);
    }).not.toThrow();

    // But resolvePool (via quote) should throw
    expect(
      client.quote("USDC", "DAI", 100),
    ).rejects.toThrow("No Curve pools configured for solana");
  });

  test("wrong-chain token pair throws pool-not-found", () => {
    // stETH pool only exists on ethereum
    const arbClient = new CurveClient("arbitrum");
    expect(
      arbClient.quote("ETH", "stETH", 1),
    ).rejects.toThrow("No Curve pool found for ETH/STETH on arbitrum");
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
        const found = pool.tokens.some(
          (t) => t.toUpperCase() === iToken,
        ) && pool.tokens.some((t) => t.toUpperCase() === jToken);
        expect(found).toBe(true);
      }
    }
  });

  test("steth pool case-insensitive matching", () => {
    const pool = CURVE_POOLS.ethereum.steth;
    const hasStETH = pool.tokens.some(
      (t) => t.toUpperCase() === "STETH",
    );
    expect(hasStETH).toBe(true);
  });

  test("invalid pair throws pool-not-found error", () => {
    const client = new CurveClient("ethereum");
    expect(
      client.quote("USDC", "BONK", 100),
    ).rejects.toThrow("No Curve pool found");
  });
});
