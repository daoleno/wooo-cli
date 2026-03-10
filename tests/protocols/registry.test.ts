import { describe, expect, test } from "bun:test";
import { getProtocol, listProtocols } from "../../src/protocols/registry";

describe("protocol registry", () => {
  test("listProtocols returns at least hyperliquid", () => {
    const protocols = listProtocols();
    const names = protocols.map((p) => p.name);
    expect(names).toContain("hyperliquid");
  });

  test("getProtocol returns protocol by name", () => {
    const protocol = getProtocol("hyperliquid");
    expect(protocol).toBeDefined();
    expect(protocol!.name).toBe("hyperliquid");
    expect(protocol!.type).toBe("perps");
  });

  test("getProtocol returns undefined for unknown", () => {
    const protocol = getProtocol("nonexistent");
    expect(protocol).toBeUndefined();
  });
});
