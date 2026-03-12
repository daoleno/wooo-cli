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
    expect(names).toContain("hyperliquid");
    expect(names).toContain("okx");
    expect(names).toContain("binance");
    expect(names).toContain("bybit");
    expect(names).toContain("uniswap");
    expect(names).toContain("aave");
    expect(names).toContain("lido");
    expect(names).toContain("gmx");
    expect(names).toContain("curve");
    expect(names).toContain("jupiter");
    expect(names).toContain("stargate");
  });

  test("getProtocol returns protocol by name", () => {
    const protocol = getProtocol("hyperliquid");
    expect(protocol).toBeDefined();
    expect(protocol!.name).toBe("hyperliquid");
    expect(protocol!.type).toBe("perps");
  });

  test("CEX protocols have correct type", () => {
    for (const name of ["okx", "binance", "bybit"]) {
      const protocol = getProtocol(name);
      expect(protocol).toBeDefined();
      expect(protocol!.type).toBe("cex");
      expect(protocol!.requiresAuth).toBe(true);
    }
  });

  test("DeFi protocols have correct types", () => {
    expect(getProtocol("uniswap")!.type).toBe("dex");
    expect(getProtocol("aave")!.type).toBe("lending");
    expect(getProtocol("lido")!.type).toBe("staking");
    expect(getProtocol("gmx")!.type).toBe("perps");
    expect(getProtocol("stargate")!.type).toBe("bridge");
  });

  test("listProtocolsByGroup groups correctly", () => {
    const groups = listProtocolsByGroup();
    expect(groups.cex.map((p) => p.name)).toEqual(["okx", "binance", "bybit"]);
    expect(groups.perps.map((p) => p.name)).toEqual(["hyperliquid", "gmx"]);
    expect(groups.dex.map((p) => p.name)).toEqual([
      "uniswap",
      "curve",
      "jupiter",
    ]);
    expect(groups.defi.map((p) => p.name)).toContain("aave");
    expect(groups.defi.map((p) => p.name)).toContain("lido");
    expect(groups.bridge.map((p) => p.name)).toEqual(["stargate"]);
  });

  test("getProtocol returns undefined for unknown", () => {
    const protocol = getProtocol("nonexistent");
    expect(protocol).toBeUndefined();
  });
});
