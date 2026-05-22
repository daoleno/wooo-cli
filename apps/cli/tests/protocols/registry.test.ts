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
      "polymarket",
      "uniswap",
      "curve",
      "jupiter",
      "aave",
      "morpho",
      "lido",
      "mpp",
      "x402",
      "lifi",
      "okx",
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
    // Note: "okx" appears twice — once for CEX (type: "cex"), once for bridge (type: "bridge").
    // getProtocol("okx") returns the first match (CEX). This is expected.
    expect(getProtocol("okx")?.type).toBe("cex");
  });

  test("protocols have correct types and account modes", () => {
    expect(getProtocol("uniswap")?.type).toBe("dex");
    expect(getProtocol("aave")?.type).toBe("lending");
    expect(getProtocol("morpho")?.type).toBe("lending");
    expect(getProtocol("lido")?.type).toBe("staking");
    expect(getProtocol("hyperliquid")?.type).toBe("perps");
    expect(getProtocol("polymarket")?.type).toBe("prediction");
    expect(getProtocol("mpp")?.type).toBe("payments");
    expect(getProtocol("x402")?.type).toBe("payments");
    expect(getProtocol("uniswap")?.writeAccountType).toBe("evm");
    expect(getProtocol("jupiter")?.writeAccountType).toBe("solana");
    expect(getProtocol("morpho")?.writeAccountType).toBe("evm");
    expect(getProtocol("polymarket")?.writeAccountType).toBe("evm");
    expect(getProtocol("mpp")?.writeAccountType).toBe("evm");
    expect(getProtocol("x402")?.writeAccountType).toBe("evm");
  });

  test("listProtocolsByGroup groups correctly", () => {
    const groups = listProtocolsByGroup();
    expect(groups.cex.map((p) => p.name)).toEqual(["okx", "binance", "bybit"]);
    expect(groups.perps.map((p) => p.name)).toEqual(["hyperliquid"]);
    expect(groups.prediction.map((p) => p.name)).toEqual(["polymarket"]);
    expect(groups.dex.map((p) => p.name)).toEqual([
      "uniswap",
      "curve",
      "jupiter",
    ]);
    expect(groups.lend.map((p) => p.name)).toEqual(["aave", "morpho"]);
    expect(groups.stake.map((p) => p.name)).toEqual(["lido"]);
    expect(groups.bridge.map((p) => p.name)).toEqual(["lifi", "okx"]);
    expect(groups.pay.map((p) => p.name)).toEqual(["mpp", "x402"]);
  });

  test("getProtocol returns undefined for unknown", () => {
    const protocol = getProtocol("nonexistent");
    expect(protocol).toBeUndefined();
  });
});
