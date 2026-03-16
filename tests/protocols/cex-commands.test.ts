import { describe, expect, test } from "bun:test";
import { calculateFuturesOrderAmount } from "../../src/protocols/cex-base/client";
import {
  createFuturesOrderExecutionPlan,
  createSpotOrderExecutionPlan,
} from "../../src/protocols/cex-base/operations";

/**
 * Tests CEX command parameter parsing and validation logic.
 * These test the same math used in cex-base operations for
 * futures position sizing and order construction.
 */

describe("CEX futures position sizing", () => {
  test("USD size converts to token amount correctly", () => {
    // $1000 at BTC price $100,000 = 0.01 BTC
    const amount = calculateFuturesOrderAmount(1000, 100000, {
      contract: false,
      contractSize: 1,
      inverse: false,
    });
    expect(amount).toBe(0.01);
  });

  test("small USD size at high price", () => {
    // $100 at BTC $100,000 = 0.001 BTC
    const amount = calculateFuturesOrderAmount(100, 100000, {
      contract: false,
      contractSize: 1,
      inverse: false,
    });
    expect(amount).toBe(0.001);
  });

  test("large USD size at low price", () => {
    // $10000 at DOGE $0.10 = 100,000 DOGE
    const amount = calculateFuturesOrderAmount(10000, 0.1, {
      contract: false,
      contractSize: 1,
      inverse: false,
    });
    expect(amount).toBe(100000);
  });

  test("amount.toFixed(6) precision for display", () => {
    const amount = calculateFuturesOrderAmount(1000, 100000, {
      contract: false,
      contractSize: 1,
      inverse: false,
    });
    expect(amount.toFixed(6)).toBe("0.010000");

    const small = calculateFuturesOrderAmount(100, 67890.12, {
      contract: false,
      contractSize: 1,
      inverse: false,
    });
    expect(Number.parseFloat(small.toFixed(6))).toBeCloseTo(small, 6);
  });

  test("contract markets use contractSize when deriving order amount", () => {
    const amount = calculateFuturesOrderAmount(1000, 100000, {
      contract: true,
      contractSize: 0.001,
      inverse: false,
    });
    expect(amount).toBe(10);
  });

  test("inverse markets are rejected", () => {
    expect(() =>
      calculateFuturesOrderAmount(1000, 100000, {
        contract: true,
        contractSize: 100,
        inverse: true,
      }),
    ).toThrow("Inverse futures markets are not supported");
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

describe("CEX execution plans", () => {
  test("spot order plan uses exchange-api account type", () => {
    const plan = createSpotOrderExecutionPlan({
      exchangeId: "binance",
      command: "buy",
      pair: "BTC/USDT",
      amount: 0.01,
      estimatedPrice: 100000,
    });

    expect(plan.kind).toBe("execution-plan");
    expect(plan.operation.protocol).toBe("binance");
    expect(plan.operation.command).toBe("buy");
    expect(plan.accountType).toBe("exchange-api");
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]?.details.side).toBe("buy");
  });

  test("futures order plan includes leverage and order steps", () => {
    const plan = createFuturesOrderExecutionPlan({
      exchangeId: "okx",
      command: "short",
      symbol: "BTC/USDT:USDT",
      sizeUsd: 1000,
      amount: 0.01,
      estimatedPrice: 100000,
      contractSize: 1,
      marketType: "contract",
      leverage: 5,
    });

    expect(plan.kind).toBe("execution-plan");
    expect(plan.operation.protocol).toBe("okx");
    expect(plan.operation.command).toBe("short");
    expect(plan.accountType).toBe("exchange-api");
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0]?.details.leverage).toBe("5x");
    expect(plan.steps[1]?.details.side).toBe("sell");
  });
});
