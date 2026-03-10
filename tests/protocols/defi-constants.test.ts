import { describe, expect, test } from "bun:test";
import { AAVE_POOL, AAVE_POOL_DATA_PROVIDER } from "../../src/protocols/aave/constants";
import { STETH_ADDRESS, WSTETH_ADDRESS } from "../../src/protocols/lido/constants";
import { GMX_MARKETS } from "../../src/protocols/gmx/constants";
import { LZ_ENDPOINT_IDS, STARGATE_POOLS } from "../../src/protocols/stargate/constants";

describe("Aave V3 contract addresses", () => {
  test("pool address exists for all supported chains", () => {
    const chains = ["ethereum", "arbitrum", "optimism", "polygon", "base"];
    for (const chain of chains) {
      expect(AAVE_POOL[chain]).toBeDefined();
      expect(AAVE_POOL[chain]).toMatch(/^0x[0-9a-fA-F]{40}$/);
    }
  });

  test("data provider exists for all supported chains", () => {
    const chains = ["ethereum", "arbitrum", "optimism", "polygon", "base"];
    for (const chain of chains) {
      expect(AAVE_POOL_DATA_PROVIDER[chain]).toBeDefined();
      expect(AAVE_POOL_DATA_PROVIDER[chain]).toMatch(/^0x[0-9a-fA-F]{40}$/);
    }
  });

  test("pool and data provider addresses differ per chain", () => {
    for (const chain of Object.keys(AAVE_POOL)) {
      if (AAVE_POOL_DATA_PROVIDER[chain]) {
        expect(AAVE_POOL[chain]).not.toBe(AAVE_POOL_DATA_PROVIDER[chain]);
      }
    }
  });
});

describe("Lido contract addresses", () => {
  test("stETH address is valid", () => {
    expect(STETH_ADDRESS).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(STETH_ADDRESS).toBe("0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84");
  });

  test("wstETH address is valid and different from stETH", () => {
    expect(WSTETH_ADDRESS).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(WSTETH_ADDRESS).not.toBe(STETH_ADDRESS);
  });
});

describe("GMX V2 markets", () => {
  test("BTC/USD market has correct structure", () => {
    const btc = GMX_MARKETS["BTC/USD"];
    expect(btc).toBeDefined();
    expect(btc.marketToken).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(btc.indexToken).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(btc.longToken).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(btc.shortToken).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  test("ETH/USD market exists", () => {
    expect(GMX_MARKETS["ETH/USD"]).toBeDefined();
  });

  test("all markets use USDC as short token", () => {
    const usdcArbitrum = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
    for (const [name, market] of Object.entries(GMX_MARKETS)) {
      expect(market.shortToken.toLowerCase()).toBe(
        usdcArbitrum.toLowerCase(),
      );
    }
  });

  test("market tokens are unique", () => {
    const tokens = new Set<string>();
    for (const market of Object.values(GMX_MARKETS)) {
      expect(tokens.has(market.marketToken.toLowerCase())).toBe(false);
      tokens.add(market.marketToken.toLowerCase());
    }
  });

  test("GmxClient.markets returns all market names", () => {
    const { GmxClient } = require("../../src/protocols/gmx/client");
    const client = new GmxClient();
    const markets = client.markets();
    expect(markets).toContain("BTC/USD");
    expect(markets).toContain("ETH/USD");
    expect(markets.length).toBe(Object.keys(GMX_MARKETS).length);
  });
});

describe("Stargate bridge routes", () => {
  test("LayerZero endpoint IDs are unique per chain", () => {
    const ids = new Set<number>();
    for (const [chain, eid] of Object.entries(LZ_ENDPOINT_IDS)) {
      expect(ids.has(eid)).toBe(false);
      ids.add(eid);
    }
  });

  test("USDC supported on multiple chains", () => {
    let chainsWithUSDC = 0;
    for (const [chain, pools] of Object.entries(STARGATE_POOLS)) {
      if (pools.USDC) chainsWithUSDC++;
    }
    expect(chainsWithUSDC).toBeGreaterThanOrEqual(3);
  });

  test("ETH supported on multiple chains", () => {
    let chainsWithETH = 0;
    for (const [chain, pools] of Object.entries(STARGATE_POOLS)) {
      if (pools.ETH) chainsWithETH++;
    }
    expect(chainsWithETH).toBeGreaterThanOrEqual(3);
  });

  test("all pool addresses are valid hex", () => {
    for (const [chain, pools] of Object.entries(STARGATE_POOLS)) {
      for (const [token, info] of Object.entries(pools)) {
        // EIP-55 checksummed addresses have mixed case
        expect(info.poolAddress.toLowerCase()).toMatch(/^0x[0-9a-f]{40}$/);
        expect(info.decimals).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test("StargateClient.supportedRoutes returns all tokens", () => {
    const { StargateClient } = require("../../src/protocols/stargate/client");
    const client = new StargateClient();
    const routes = client.supportedRoutes();
    expect(routes.length).toBeGreaterThanOrEqual(2); // At least USDC and ETH
    for (const route of routes) {
      expect(route.token).toBeTruthy();
      expect(route.chains.length).toBeGreaterThanOrEqual(2);
    }
  });
});
