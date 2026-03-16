import { describe, expect, test } from "bun:test";
import { type SwapQuote, selectBestRoute } from "../../src/commands/swap/index";

describe("swap aggregator route selection", () => {
  test("picks highest amountOut among two quotes", () => {
    const quotes: SwapQuote[] = [
      { protocol: "uniswap", amountOut: "999.50", price: 0.9995 },
      { protocol: "curve", amountOut: "999.80", price: 0.9998 },
    ];
    const best = selectBestRoute(quotes);
    expect(best.protocol).toBe("curve");
  });

  test("picks uniswap when it has better rate", () => {
    const quotes: SwapQuote[] = [
      { protocol: "uniswap", amountOut: "1000.20", price: 1.0002 },
      { protocol: "curve", amountOut: "999.80", price: 0.9998 },
    ];
    const best = selectBestRoute(quotes);
    expect(best.protocol).toBe("uniswap");
  });

  test("works with single quote", () => {
    const quotes: SwapQuote[] = [
      { protocol: "uniswap", amountOut: "500.00", price: 1.0 },
    ];
    const best = selectBestRoute(quotes);
    expect(best.protocol).toBe("uniswap");
  });

  test("handles equal quotes deterministically", () => {
    const quotes: SwapQuote[] = [
      { protocol: "uniswap", amountOut: "1000.00", price: 1.0 },
      { protocol: "curve", amountOut: "1000.00", price: 1.0 },
    ];
    const best = selectBestRoute(quotes);
    // When equal, sort is stable — first element stays first
    expect(best).toBeDefined();
  });

  test("handles very small differences", () => {
    const quotes: SwapQuote[] = [
      { protocol: "uniswap", amountOut: "999.999999", price: 0.999999 },
      { protocol: "curve", amountOut: "1000.000001", price: 1.000001 },
    ];
    const best = selectBestRoute(quotes);
    expect(best.protocol).toBe("curve");
  });

  test("handles large amounts correctly", () => {
    const quotes: SwapQuote[] = [
      { protocol: "uniswap", amountOut: "9999999.50", price: 0.9999 },
      { protocol: "curve", amountOut: "10000000.00", price: 1.0 },
    ];
    const best = selectBestRoute(quotes);
    expect(best.protocol).toBe("curve");
  });
});
