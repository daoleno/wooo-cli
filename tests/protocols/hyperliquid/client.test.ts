import { describe, expect, test } from "bun:test";
import { HyperliquidClient } from "../../../src/protocols/hyperliquid/client";

describe("HyperliquidClient", () => {
  test("creates client without auth for public endpoints", () => {
    const client = new HyperliquidClient();
    expect(client).toBeDefined();
  });

  test("fetchMarkets returns market data", async () => {
    const client = new HyperliquidClient();
    const markets = await client.fetchMarkets();
    expect(Array.isArray(markets)).toBe(true);
    expect(markets.length).toBeGreaterThan(0);
    const btc = markets.find(
      (m) => m.symbol === "BTC/USDC:USDC" || m.symbol.includes("BTC"),
    );
    expect(btc).toBeDefined();
  });

  test("fetchTicker returns price data for BTC", async () => {
    const client = new HyperliquidClient();
    const ticker = await client.fetchTicker("BTC/USDC:USDC");
    expect(ticker.symbol).toContain("BTC");
    expect(ticker.last).toBeGreaterThan(0);
  });

  test("fetchFundingRate returns funding data", async () => {
    const client = new HyperliquidClient();
    const funding = await client.fetchFundingRate("BTC/USDC:USDC");
    expect(funding.symbol).toContain("BTC");
    expect(typeof funding.fundingRate).toBe("number");
  });
});
