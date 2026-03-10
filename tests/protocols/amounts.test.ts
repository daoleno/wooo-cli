import { describe, expect, test } from "bun:test";
import { formatUnits, parseUnits } from "viem";

/**
 * Amount precision tests — verifying the math that converts
 * between human-readable amounts and on-chain wei/lamports.
 * Getting decimals wrong means sending 1000x too much/little.
 */
describe("amount precision: EVM token conversions", () => {
  test("1 USDC (6 decimals) = 1000000 wei", () => {
    const wei = parseUnits("1", 6);
    expect(wei).toBe(1_000_000n);
  });

  test("10000 USDC = 10000000000 wei", () => {
    const wei = parseUnits("10000", 6);
    expect(wei).toBe(10_000_000_000n);
  });

  test("1 ETH (18 decimals) = 1e18 wei", () => {
    const wei = parseUnits("1", 18);
    expect(wei).toBe(1_000_000_000_000_000_000n);
  });

  test("0.5 ETH = 5e17 wei", () => {
    const wei = parseUnits("0.5", 18);
    expect(wei).toBe(500_000_000_000_000_000n);
  });

  test("1 WBTC (8 decimals) = 100000000 satoshi", () => {
    const wei = parseUnits("1", 8);
    expect(wei).toBe(100_000_000n);
  });

  test("formatUnits reverses parseUnits correctly", () => {
    const decimals = [6, 8, 18];
    const amounts = ["1", "0.5", "1000.123456"];

    for (const d of decimals) {
      for (const a of amounts) {
        const parsed = parseUnits(a, d);
        const formatted = formatUnits(parsed, d);
        // Compare as numbers to handle trailing zeros
        expect(Number.parseFloat(formatted)).toBeCloseTo(
          Number.parseFloat(a),
          d > 6 ? 6 : d,
        );
      }
    }
  });
});

describe("amount precision: slippage calculations", () => {
  test("0.5% slippage on 1000 USDC", () => {
    const amount = parseUnits("1000", 6);
    const slippageBps = 50n; // 0.5%
    const minOutput = (amount * (10000n - slippageBps)) / 10000n;
    expect(minOutput).toBe(995_000_000n); // 995 USDC
    expect(formatUnits(minOutput, 6)).toBe("995");
  });

  test("0.3% slippage on 10 ETH", () => {
    const amount = parseUnits("10", 18);
    const slippageBps = 30n;
    const minOutput = (amount * (10000n - slippageBps)) / 10000n;
    // 10 * 0.997 = 9.97
    expect(Number.parseFloat(formatUnits(minOutput, 18))).toBeCloseTo(9.97, 4);
  });

  test("slippage never underflows for small amounts", () => {
    // 1 wei of USDC
    const amount = 1n;
    const slippageBps = 50n;
    const minOutput = (amount * (10000n - slippageBps)) / 10000n;
    // Should be 0, not negative
    expect(minOutput).toBeGreaterThanOrEqual(0n);
  });
});

describe("amount precision: futures position sizing", () => {
  test("USD to token amount conversion", () => {
    const sizeUsd = 1000;
    const price = 100000; // BTC at $100k
    const amount = sizeUsd / price;
    expect(amount).toBeCloseTo(0.01, 6);
  });

  test("leverage does not affect amount calculation", () => {
    // The amount of the underlying asset stays the same regardless of leverage
    // Leverage only affects collateral required
    const sizeUsd = 1000;
    const price = 2000; // ETH
    const amount = sizeUsd / price;
    expect(amount).toBe(0.5);
    // With 5x leverage, still trading 0.5 ETH, just with less collateral
  });
});

describe("amount precision: Aave rate conversion", () => {
  test("RAY (1e27) to percentage", () => {
    const RAY = 10n ** 27n;
    // 3% APY in ray = 0.03 * 1e27
    const rate3pct = (RAY * 3n) / 100n;
    const pct = (Number(rate3pct) / Number(RAY)) * 100;
    expect(pct).toBeCloseTo(3.0, 4);
  });

  test("zero rate converts to 0%", () => {
    const RAY = 10n ** 27n;
    const pct = (Number(0n) / Number(RAY)) * 100;
    expect(pct).toBe(0);
  });
});

describe("amount precision: Solana lamport conversions", () => {
  test("1 SOL = 1e9 lamports", () => {
    const decimals = 9;
    const lamports = Math.round(1 * 10 ** decimals);
    expect(lamports).toBe(1_000_000_000);
  });

  test("0.001 SOL = 1e6 lamports", () => {
    const decimals = 9;
    const lamports = Math.round(0.001 * 10 ** decimals);
    expect(lamports).toBe(1_000_000);
  });

  test("1 USDC on Solana = 1e6 (6 decimals)", () => {
    const decimals = 6;
    const amount = Math.round(1 * 10 ** decimals);
    expect(amount).toBe(1_000_000);
  });

  test("floating point safety: 0.1 + 0.2 rounding", () => {
    // Ensure we use Math.round to avoid floating point issues
    const amount = 0.1 + 0.2; // = 0.30000000000000004
    const lamports = Math.round(amount * 10 ** 9);
    expect(lamports).toBe(300_000_000); // Correct, not 300_000_000.xxx
  });
});
