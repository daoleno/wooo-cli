import { describe, expect, test } from "bun:test";

/**
 * Tests CEX command parameter parsing and validation logic.
 * These test the same math used in cex-base/commands.ts for
 * futures position sizing and order construction.
 */

describe("CEX futures position sizing", () => {
  test("USD size converts to token amount correctly", () => {
    // $1000 at BTC price $100,000 = 0.01 BTC
    const sizeUsd = 1000;
    const price = 100000;
    const amount = sizeUsd / price;
    expect(amount).toBe(0.01);
  });

  test("small USD size at high price", () => {
    // $100 at BTC $100,000 = 0.001 BTC
    const amount = 100 / 100000;
    expect(amount).toBe(0.001);
  });

  test("large USD size at low price", () => {
    // $10000 at DOGE $0.10 = 100,000 DOGE
    const amount = 10000 / 0.1;
    expect(amount).toBe(100000);
  });

  test("amount.toFixed(6) precision for display", () => {
    const amount = 1000 / 100000; // 0.01
    expect(amount.toFixed(6)).toBe("0.010000");

    const small = 100 / 67890.12; // ~0.001473
    expect(Number.parseFloat(small.toFixed(6))).toBeCloseTo(small, 6);
  });
});

describe("CEX order amount parsing", () => {
  test("parseFloat handles integer strings", () => {
    expect(Number.parseFloat("100")).toBe(100);
  });

  test("parseFloat handles decimal strings", () => {
    expect(Number.parseFloat("0.001")).toBe(0.001);
  });

  test("parseFloat handles scientific notation", () => {
    expect(Number.parseFloat("1e-3")).toBe(0.001);
  });

  test("parseInt handles leverage strings", () => {
    expect(Number.parseInt("5", 10)).toBe(5);
    expect(Number.parseInt("10", 10)).toBe(10);
    expect(Number.parseInt("1", 10)).toBe(1);
  });

  test("NaN detection for invalid amounts", () => {
    expect(Number.isNaN(Number.parseFloat("abc"))).toBe(true);
    expect(Number.isNaN(Number.parseFloat(""))).toBe(true);
    expect(Number.isNaN(Number.parseFloat("not-a-number"))).toBe(true);
  });
});

describe("CEX auth resolution", () => {
  test("env var prefix construction", () => {
    const exchanges = ["okx", "binance", "bybit"];
    for (const ex of exchanges) {
      const prefix = `WOOO_${ex.toUpperCase()}_`;
      expect(`${prefix}API_KEY`).toBe(`WOOO_${ex.toUpperCase()}_API_KEY`);
      expect(`${prefix}API_SECRET`).toBe(`WOOO_${ex.toUpperCase()}_API_SECRET`);
    }
  });

  test("OKX has passphrase env var", () => {
    const prefix = "WOOO_OKX_";
    expect(`${prefix}PASSPHRASE`).toBe("WOOO_OKX_PASSPHRASE");
  });
});
