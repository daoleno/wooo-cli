import { describe, expect, test } from "bun:test";
import {
  getProtocol,
  listProtocols,
  listProtocolsByGroup,
} from "../../src/protocols/registry";

describe("protocol registry", () => {
  test("listProtocols returns all registered protocols", () => {
    const protocols = listProtocols();
    const names = protocols.map((p) => p.name);
    expect(names).toEqual([
      "okx",
      "binance",
      "bybit",
      "hyperliquid",
      "uniswap",
      "curve",
      "jupiter",
      "aave",
      "lido",
    ]);
  });

  test("getProtocol returns protocol by name", () => {
    const protocol = getProtocol("hyperliquid");
    expect(protocol).toBeDefined();
    expect(protocol?.name).toBe("hyperliquid");
    expect(protocol?.type).toBe("perps");
  });

  test("CEX protocols have correct type", () => {
    for (const name of ["okx", "binance", "bybit"]) {
      const protocol = getProtocol(name);
      expect(protocol).toBeDefined();
      expect(protocol?.type).toBe("cex");
      expect(protocol?.writeAccountType).toBe("exchange-api");
    }
  });

  test("protocols have correct types and account modes", () => {
    expect(getProtocol("uniswap")?.type).toBe("dex");
    expect(getProtocol("aave")?.type).toBe("lending");
    expect(getProtocol("lido")?.type).toBe("staking");
    expect(getProtocol("hyperliquid")?.type).toBe("perps");
    expect(getProtocol("uniswap")?.writeAccountType).toBe("evm");
    expect(getProtocol("jupiter")?.writeAccountType).toBe("solana");
  });

  test("listProtocolsByGroup groups correctly", () => {
    const groups = listProtocolsByGroup();
    expect(groups.cex.map((p) => p.name)).toEqual(["okx", "binance", "bybit"]);
    expect(groups.perps.map((p) => p.name)).toEqual(["hyperliquid"]);
    expect(groups.dex.map((p) => p.name)).toEqual([
      "uniswap",
      "curve",
      "jupiter",
    ]);
    expect(groups.lend.map((p) => p.name)).toEqual(["aave"]);
    expect(groups.stake.map((p) => p.name)).toEqual(["lido"]);
    expect(groups.bridge).toEqual([]);
  });

  test("getProtocol returns undefined for unknown", () => {
    const protocol = getProtocol("nonexistent");
    expect(protocol).toBeUndefined();
  });
});
