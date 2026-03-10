import { describe, expect, test } from "bun:test";
import { getProtocol, listProtocols } from "../../src/protocols/registry";

describe("protocol registry", () => {
  test("listProtocols returns all registered protocols", () => {
    const protocols = listProtocols();
    const names = protocols.map((p) => p.name);
    expect(names).toContain("hyperliquid");
    expect(names).toContain("okx");
    expect(names).toContain("binance");
    expect(names).toContain("bybit");
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

  test("getProtocol returns undefined for unknown", () => {
    const protocol = getProtocol("nonexistent");
    expect(protocol).toBeUndefined();
  });
});
