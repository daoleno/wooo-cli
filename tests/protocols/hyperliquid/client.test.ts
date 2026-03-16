import { describe, expect, test } from "bun:test";
import { HyperliquidClient } from "../../../src/protocols/hyperliquid/client";
import { createHyperliquidExecutionPlan } from "../../../src/protocols/hyperliquid/plan";

describe("HyperliquidClient", () => {
  function createStubbedClient() {
    const client = new HyperliquidClient() as HyperliquidClient & {
      exchange: {
        fetchMarkets: () => Promise<Array<{ symbol: string }>>;
        fetchTicker: (symbol: string) => Promise<{
          symbol: string;
          last: number;
          high: number;
          low: number;
          baseVolume: number;
          percentage: number;
        }>;
        fetchFundingRate: (symbol: string) => Promise<{
          symbol: string;
          fundingRate: number;
          fundingTimestamp: number;
        }>;
      };
    };
    client.exchange = {
      fetchMarkets: async () => [
        { symbol: "BTC/USDC:USDC" },
        { symbol: "ETH/USDC:USDC" },
      ],
      fetchTicker: async (symbol: string) => ({
        symbol,
        last: 100000,
        high: 101000,
        low: 99000,
        baseVolume: 1234,
        percentage: 1.23,
      }),
      fetchFundingRate: async (symbol: string) => ({
        symbol,
        fundingRate: 0.0001,
        fundingTimestamp: 1700000000000,
      }),
    };
    return client;
  }

  test("creates client without auth for public endpoints", () => {
    const client = new HyperliquidClient();
    expect(client).toBeDefined();
  });

  test("fetchMarkets returns market data", async () => {
    const client = createStubbedClient();
    const markets = await client.fetchMarkets();
    expect(Array.isArray(markets)).toBe(true);
    expect(markets.length).toBeGreaterThan(0);
    const btc = markets.find(
      (m) => m.symbol === "BTC/USDC:USDC" || m.symbol.includes("BTC"),
    );
    expect(btc).toBeDefined();
  });

  test("fetchTicker returns price data for BTC", async () => {
    const client = createStubbedClient();
    const ticker = await client.fetchTicker("BTC/USDC:USDC");
    expect(ticker.symbol).toContain("BTC");
    expect(ticker.last).toBeGreaterThan(0);
  });

  test("fetchFundingRate returns funding data", async () => {
    const client = createStubbedClient();
    const funding = await client.fetchFundingRate("BTC/USDC:USDC");
    expect(funding.symbol).toContain("BTC");
    expect(typeof funding.fundingRate).toBe("number");
  });

  test("execution plan captures leverage and order steps", () => {
    const plan = createHyperliquidExecutionPlan({
      side: "long",
      symbol: "BTC/USDC:USDC",
      sizeUsd: 100,
      amount: "0.001000",
      estimatedPrice: 100000,
      leverage: 5,
    });

    expect(plan.kind).toBe("execution-plan");
    expect(plan.operation.protocol).toBe("hyperliquid");
    expect(plan.operation.command).toBe("long");
    expect(plan.chain).toBe("hyperliquid");
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0]?.details.leverage).toBe("5x");
    expect(plan.steps[1]?.details.side).toBe("buy");
  });
});
