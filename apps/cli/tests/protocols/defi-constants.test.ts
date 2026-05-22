import { describe, expect, test } from "bun:test";
import { isAddress } from "viem";
import {
  AAVE_POOL,
  AAVE_POOL_DATA_PROVIDER,
} from "../../src/protocols/aave/constants";
import {
  STETH_ADDRESS,
  WSTETH_ADDRESS,
} from "../../src/protocols/lido/constants";
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
