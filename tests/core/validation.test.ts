import { describe, expect, test } from "bun:test";
import {
  AmountSchema,
  chainSchema,
  formatCrypto,
  formatUSD,
  LeverageSchema,
  PairSchema,
  safeJsonStringify,
  TokenSymbolSchema,
} from "../../src/core/validation";

describe("AmountSchema", () => {
  test("parses valid positive numbers", () => {
    expect(AmountSchema.parse("100")).toBe(100);
    expect(AmountSchema.parse("0.001")).toBe(0.001);
    expect(AmountSchema.parse("1000000")).toBe(1000000);
    expect(AmountSchema.parse("99.99")).toBe(99.99);
  });

  test("rejects zero", () => {
    expect(() => AmountSchema.parse("0")).toThrow("must be greater than 0");
  });

  test("rejects negative numbers", () => {
    expect(() => AmountSchema.parse("-1")).toThrow("must be greater than 0");
    expect(() => AmountSchema.parse("-0.5")).toThrow("must be greater than 0");
  });

  test("rejects NaN strings", () => {
    expect(() => AmountSchema.parse("abc")).toThrow("not a number");
    expect(() => AmountSchema.parse("")).toThrow("not a number");
    expect(() => AmountSchema.parse("NaN")).toThrow("not a number");
  });

  test("rejects Infinity", () => {
    expect(() => AmountSchema.parse("Infinity")).toThrow("not finite");
    expect(() => AmountSchema.parse("-Infinity")).toThrow("not finite");
  });
});

describe("LeverageSchema", () => {
  test("parses valid leverage values", () => {
    expect(LeverageSchema.parse("1")).toBe(1);
    expect(LeverageSchema.parse("10")).toBe(10);
    expect(LeverageSchema.parse("100")).toBe(100);
    expect(LeverageSchema.parse("200")).toBe(200);
  });

  test("rejects leverage below 1", () => {
    expect(() => LeverageSchema.parse("0")).toThrow(
      "must be between 1 and 200",
    );
  });

  test("rejects leverage above 200", () => {
    expect(() => LeverageSchema.parse("201")).toThrow(
      "must be between 1 and 200",
    );
    expect(() => LeverageSchema.parse("1000")).toThrow(
      "must be between 1 and 200",
    );
  });

  test("rejects non-numeric strings", () => {
    expect(() => LeverageSchema.parse("abc")).toThrow("not a number");
    expect(() => LeverageSchema.parse("")).toThrow("not a number");
  });

  test("truncates decimals to integer", () => {
    // parseInt("10.5") returns 10
    expect(LeverageSchema.parse("10.5")).toBe(10);
  });
});

describe("TokenSymbolSchema", () => {
  test("uppercases valid symbols", () => {
    expect(TokenSymbolSchema.parse("eth")).toBe("ETH");
    expect(TokenSymbolSchema.parse("Usdc")).toBe("USDC");
    expect(TokenSymbolSchema.parse("WBTC")).toBe("WBTC");
  });

  test("trims whitespace", () => {
    expect(TokenSymbolSchema.parse("  ETH  ")).toBe("ETH");
  });

  test("rejects empty string", () => {
    expect(() => TokenSymbolSchema.parse("")).toThrow();
  });
});

describe("PairSchema", () => {
  test("accepts valid pairs with /", () => {
    expect(PairSchema.parse("BTC/USDT")).toBe("BTC/USDT");
    expect(PairSchema.parse("ETH/USD")).toBe("ETH/USD");
  });

  test("rejects pairs without /", () => {
    expect(() => PairSchema.parse("BTCUSDT")).toThrow();
    expect(() => PairSchema.parse("ETH")).toThrow();
  });
});

describe("chainSchema", () => {
  const supported = ["ethereum", "arbitrum", "optimism", "polygon"];

  test("accepts supported chains", () => {
    const schema = chainSchema(supported);
    expect(schema.parse("ethereum")).toBe("ethereum");
    expect(schema.parse("arbitrum")).toBe("arbitrum");
  });

  test("normalizes common chain aliases", () => {
    const schema = chainSchema(supported);
    expect(schema.parse("eth")).toBe("ethereum");
    expect(schema.parse("arb")).toBe("arbitrum");
    expect(schema.parse("op")).toBe("optimism");
    expect(schema.parse("matic")).toBe("polygon");
  });

  test("rejects unsupported chains", () => {
    const schema = chainSchema(supported);
    expect(() => schema.parse("solana")).toThrow("Unsupported chain");
    expect(() => schema.parse("avalanche")).toThrow("Unsupported chain");
  });
});

describe("formatUSD", () => {
  test("formats numbers as USD", () => {
    expect(formatUSD(1234.56)).toBe("$1,234.56");
    expect(formatUSD(0)).toBe("$0.00");
    expect(formatUSD(1000000)).toBe("$1,000,000.00");
  });

  test("returns N/A for non-finite values", () => {
    expect(formatUSD(NaN)).toBe("N/A");
    expect(formatUSD(Infinity)).toBe("N/A");
    expect(formatUSD(-Infinity)).toBe("N/A");
  });
});

describe("formatCrypto", () => {
  test("formats crypto amounts", () => {
    const result = formatCrypto(1.23456789, 6);
    expect(result).toContain("1.23456");
  });

  test("returns N/A for non-finite values", () => {
    expect(formatCrypto(NaN)).toBe("N/A");
    expect(formatCrypto(Infinity)).toBe("N/A");
  });
});

describe("safeJsonStringify", () => {
  test("serializes normal objects", () => {
    const result = safeJsonStringify({ a: 1, b: "hello" });
    expect(JSON.parse(result)).toEqual({ a: 1, b: "hello" });
  });

  test("replaces NaN with null", () => {
    const result = safeJsonStringify({ value: NaN });
    expect(JSON.parse(result)).toEqual({ value: null });
  });

  test("replaces Infinity with null", () => {
    const result = safeJsonStringify({ value: Infinity });
    expect(JSON.parse(result)).toEqual({ value: null });
  });

  test("replaces -Infinity with null", () => {
    const result = safeJsonStringify({ value: -Infinity });
    expect(JSON.parse(result)).toEqual({ value: null });
  });

  test("handles nested objects with bad numbers", () => {
    const result = safeJsonStringify({
      outer: { inner: NaN, valid: 42 },
    });
    const parsed = JSON.parse(result);
    expect(parsed.outer.inner).toBeNull();
    expect(parsed.outer.valid).toBe(42);
  });

  test("serializes bigint values as strings", () => {
    const result = safeJsonStringify({ value: 42n });
    expect(JSON.parse(result)).toEqual({ value: "42" });
  });
});
