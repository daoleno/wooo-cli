import { describe, expect, test } from "bun:test";
import { isAddress } from "viem";
import {
  AAVE_POOL,
  AAVE_POOL_DATA_PROVIDER,
} from "../../src/protocols/aave/constants";
import { GMX_MARKETS } from "../../src/protocols/gmx/constants";
import {
  STETH_ADDRESS,
  WSTETH_ADDRESS,
} from "../../src/protocols/lido/constants";
import {
  LZ_ENDPOINT_IDS,
  STARGATE_POOLS,
  STARGATE_ROUTER,
} from "../../src/protocols/stargate/constants";
import {
  getQuoterAddress,
  getSwapRouterAddress,
  QUOTER_V2,
  SWAP_ROUTER,
} from "../../src/protocols/uniswap/constants";

describe("Aave V3 contract addresses", () => {
  test("data provider matches the current Aave address book", () => {
    expect(AAVE_POOL_DATA_PROVIDER).toEqual({
      ethereum: "0x0a16f2FCC0D44FaE41cc54e079281D84A363bECD",
      arbitrum: "0x243Aa95cAC2a25651eda86e80bEe66114413c43b",
      optimism: "0x243Aa95cAC2a25651eda86e80bEe66114413c43b",
      polygon: "0x243Aa95cAC2a25651eda86e80bEe66114413c43b",
      base: "0x0F43731EB8d45A581f4a36DD74F5f358bc90C73A",
    });
  });

  test("pool address exists for all supported chains", () => {
    const chains = ["ethereum", "arbitrum", "optimism", "polygon", "base"];
    for (const chain of chains) {
      expect(AAVE_POOL[chain]).toBeDefined();
      expect(isAddress(AAVE_POOL[chain])).toBe(true);
    }
  });

  test("data provider exists for all supported chains", () => {
    const chains = ["ethereum", "arbitrum", "optimism", "polygon", "base"];
    for (const chain of chains) {
      expect(AAVE_POOL_DATA_PROVIDER[chain]).toBeDefined();
      expect(isAddress(AAVE_POOL_DATA_PROVIDER[chain])).toBe(true);
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
    for (const [_name, market] of Object.entries(GMX_MARKETS)) {
      expect(market.shortToken.toLowerCase()).toBe(usdcArbitrum.toLowerCase());
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
    for (const [_chain, eid] of Object.entries(LZ_ENDPOINT_IDS)) {
      expect(ids.has(eid)).toBe(false);
      ids.add(eid);
    }
  });

  test("USDC supported on multiple chains", () => {
    let chainsWithUSDC = 0;
    for (const [_chain, pools] of Object.entries(STARGATE_POOLS)) {
      if (pools.USDC) chainsWithUSDC++;
    }
    expect(chainsWithUSDC).toBeGreaterThanOrEqual(3);
  });

  test("ETH supported on multiple chains", () => {
    let chainsWithETH = 0;
    for (const [_chain, pools] of Object.entries(STARGATE_POOLS)) {
      if (pools.ETH) chainsWithETH++;
    }
    expect(chainsWithETH).toBeGreaterThanOrEqual(3);
  });

  test("all pool addresses are valid hex", () => {
    for (const [_chain, pools] of Object.entries(STARGATE_POOLS)) {
      for (const [_token, info] of Object.entries(pools)) {
        expect(info.poolAddress.toLowerCase()).toMatch(/^0x[0-9a-f]{40}$/);
        expect(info.decimals).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test("every chain in STARGATE_ROUTER has pool data", () => {
    for (const chain of Object.keys(STARGATE_ROUTER)) {
      expect(STARGATE_POOLS[chain]).toBeDefined();
      expect(Object.keys(STARGATE_POOLS[chain]).length).toBeGreaterThanOrEqual(
        1,
      );
    }
  });

  test("polygon has pool data matching router config", () => {
    expect(STARGATE_POOLS.polygon).toBeDefined();
    expect(STARGATE_POOLS.polygon.USDC).toBeDefined();
    expect(STARGATE_POOLS.polygon.USDT).toBeDefined();
  });

  test("StargateClient.supportedRoutes returns all tokens", () => {
    const { StargateClient } = require("../../src/protocols/stargate/client");
    const client = new StargateClient();
    const routes = client.supportedRoutes();
    expect(routes.length).toBeGreaterThanOrEqual(2);
    for (const route of routes) {
      expect(route.token).toBeTruthy();
      expect(route.chains.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("Uniswap V3 per-chain addresses", () => {
  const chains = ["ethereum", "arbitrum", "optimism", "polygon", "base"];

  test("swap router exists for all supported chains", () => {
    for (const chain of chains) {
      expect(SWAP_ROUTER[chain]).toBeDefined();
      expect(SWAP_ROUTER[chain]).toMatch(/^0x[0-9a-fA-F]{40}$/);
    }
  });

  test("quoter exists for all supported chains", () => {
    for (const chain of chains) {
      expect(QUOTER_V2[chain]).toBeDefined();
      expect(QUOTER_V2[chain]).toMatch(/^0x[0-9a-fA-F]{40}$/);
    }
  });

  test("base has different router/quoter than ethereum", () => {
    expect(SWAP_ROUTER.base).not.toBe(SWAP_ROUTER.ethereum);
    expect(QUOTER_V2.base).not.toBe(QUOTER_V2.ethereum);
  });

  test("getSwapRouterAddress throws for unsupported chain", () => {
    expect(() => getSwapRouterAddress("solana")).toThrow(
      "Uniswap not deployed on solana",
    );
  });

  test("getQuoterAddress throws for unsupported chain", () => {
    expect(() => getQuoterAddress("solana")).toThrow(
      "Uniswap not deployed on solana",
    );
  });
});
