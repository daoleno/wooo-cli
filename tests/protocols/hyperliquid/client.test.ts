import { describe, expect, test } from "bun:test";
import type { WoooSigner } from "../../../src/core/signers";
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

  function createWritableClient() {
    const captured = {
      orderRequest: null as Record<string, unknown> | null,
      requests: [] as Array<Record<string, unknown>>,
      signedRequests: [] as Array<{
        action: Record<string, unknown>;
        context?: Record<string, unknown>;
        nonce: number;
      }>,
    };

    const signer: WoooSigner = {
      walletName: "test-wallet",
      address: "0x0000000000000000000000000000000000000000",
      async signTypedData() {
        throw new Error("not used");
      },
      async writeContract() {
        throw new Error("not used");
      },
      async sendTransaction() {
        throw new Error("not used");
      },
      async signMessage() {
        throw new Error("not used");
      },
      async signHyperliquidL1Action(request) {
        captured.signedRequests.push({
          action: request.action,
          context: request.context as Record<string, unknown> | undefined,
          nonce: request.nonce,
        });
        return {
          r: `0x${"12".repeat(32)}`,
          s: `0x${"34".repeat(32)}`,
          v: 27,
        };
      },
    };

    const client = new HyperliquidClient(
      "0x0000000000000000000000000000000000000000",
      signer,
      "long",
    ) as HyperliquidClient & {
      exchange: {
        createOrdersRequest: (
          orders: Array<Record<string, unknown>>,
        ) => Record<string, unknown>;
        fetchFundingRate: (symbol: string) => Promise<{
          fundingRate: number;
          fundingTimestamp: number;
          symbol: string;
        }>;
        fetchMarkets: () => Promise<Array<{ symbol: string }>>;
        fetchPositions: () => Promise<
          Array<{
            contracts?: number;
            entryPrice?: number;
            leverage?: number;
            markPrice?: number;
            side?: string;
            symbol: string;
            unrealizedPnl?: number;
          }>
        >;
        fetchTicker: (symbol: string) => Promise<{
          baseVolume: number;
          high: number;
          last: number;
          low: number;
          percentage: number;
          symbol: string;
        }>;
        loadMarkets: () => Promise<void>;
        market: (symbol: string) => { baseId: string; symbol: string };
        parseOrder: (order: Record<string, unknown>) => {
          amount?: number;
          average?: number;
          id?: string;
          price?: number;
          side?: string;
          status?: string;
          symbol?: string;
        };
        privatePostExchange: (
          request: Record<string, unknown>,
        ) => Promise<Record<string, unknown>>;
        signL1Action: () => {
          r: `0x${string}`;
          s: `0x${string}`;
          v: number;
        };
      };
    };

    client.exchange = {
      async fetchMarkets() {
        return [{ symbol: "BTC/USDC:USDC" }];
      },
      async fetchTicker(symbol: string) {
        return {
          symbol,
          last: 100000,
          high: 101000,
          low: 99000,
          baseVolume: 1234,
          percentage: 1.23,
        };
      },
      async fetchFundingRate(symbol: string) {
        return {
          symbol,
          fundingRate: 0.0001,
          fundingTimestamp: 1700000000000,
        };
      },
      async fetchPositions() {
        return [];
      },
      async loadMarkets() {},
      market(symbol: string) {
        return { symbol, baseId: "0" };
      },
      createOrdersRequest(orders) {
        captured.orderRequest = orders[0] ?? null;
        return {
          action: {
            type: "order",
            orders: [
              {
                a: 0,
                b: true,
                p: "105000",
                s: "0.001000",
                r: false,
                t: { limit: { tif: "Ioc" } },
              },
            ],
            grouping: "na",
          },
          nonce: 321,
          signature: this.signL1Action({ type: "order" }, 321),
        };
      },
      parseOrder(order) {
        const filled = order.filled as Record<string, unknown> | undefined;
        const resting = order.resting as Record<string, unknown> | undefined;
        return {
          id: String(filled?.oid ?? resting?.oid ?? "") || undefined,
          price:
            typeof filled?.avgPx === "string"
              ? Number(filled.avgPx)
              : undefined,
          amount:
            typeof filled?.totalSz === "string"
              ? Number(filled.totalSz)
              : undefined,
          status:
            typeof order.ccxtStatus === "string" ? order.ccxtStatus : undefined,
        };
      },
      async privatePostExchange(request) {
        captured.requests.push(request);
        return {
          status: "ok",
          response: {
            type: "order",
            data: {
              statuses: [
                {
                  filled: {
                    oid: 777,
                    totalSz: "0.001000",
                    avgPx: "100500",
                  },
                },
              ],
            },
          },
        };
      },
      signL1Action() {
        return {
          r: `0x${"00".repeat(32)}`,
          s: `0x${"00".repeat(32)}`,
          v: 27,
        };
      },
    };

    return { client, captured };
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

  test("setLeverage signs and submits an async Hyperliquid action", async () => {
    const { client, captured } = createWritableClient();

    await client.setLeverage(5, "BTC/USDC:USDC");

    expect(captured.signedRequests).toHaveLength(1);
    expect(captured.signedRequests[0]?.action).toEqual({
      type: "updateLeverage",
      asset: 0,
      isCross: true,
      leverage: 5,
    });
    expect(captured.signedRequests[0]?.context).toEqual({
      actionType: "updateLeverage",
      leverage: 5,
      symbol: "BTC/USDC:USDC",
    });
    expect(captured.requests[0]?.action).toEqual({
      type: "updateLeverage",
      asset: 0,
      isCross: true,
      leverage: 5,
    });
  });

  test("createMarketOrder signs and submits an async Hyperliquid order", async () => {
    const { client, captured } = createWritableClient();

    const result = await client.createMarketOrder(
      "BTC/USDC:USDC",
      "buy",
      0.001,
      100,
      100000,
    );

    expect(captured.orderRequest).toEqual({
      symbol: "BTC/USDC:USDC",
      type: "market",
      side: "buy",
      amount: 0.001,
      price: 100000,
    });
    expect(captured.signedRequests[0]?.nonce).toBe(321);
    expect(captured.signedRequests[0]?.action).toEqual({
      type: "order",
      orders: [
        {
          a: 0,
          b: true,
          p: "105000",
          s: "0.001000",
          r: false,
          t: { limit: { tif: "Ioc" } },
        },
      ],
      grouping: "na",
    });
    expect(captured.signedRequests[0]?.context).toEqual({
      actionType: "order",
      side: "buy",
      sizeUsd: 100,
      symbol: "BTC/USDC:USDC",
    });
    expect(result).toEqual({
      orderId: "777",
      symbol: "BTC/USDC:USDC",
      side: "buy",
      size: 0.001,
      price: 100500,
      status: "filled",
    });
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
