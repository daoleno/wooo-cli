import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import {
  OkxOnchainClient,
  resolveOkxOnchainChainIndex,
  resolveOkxOnchainChainSelection,
} from "../../src/services/okx-onchain/client";

describe("OKX Onchain client", () => {
  test("signs GET requests with the query string included in the request path", async () => {
    const timestamp = "2026-03-17T06:00:00.000Z";
    let capturedHeaders: Headers | null = null;

    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        capturedHeaders = request.headers;
        const url = new URL(request.url);

        expect(url.pathname).toBe("/api/v6/dex/market/token/search");
        expect(url.searchParams.get("chains")).toBe("1,10");
        expect(url.searchParams.get("search")).toBe("weth");

        return Response.json({
          code: "0",
          data: [
            {
              chainIndex: "1",
              tokenContractAddress: "0x420",
              tokenName: "Wrapped Ether",
              tokenSymbol: "WETH",
            },
          ],
          msg: "",
        });
      },
    });

    try {
      const client = new OkxOnchainClient({
        apiKey: "test-api-key",
        secret: "test-secret",
        passphrase: "test-passphrase",
        baseUrl: `http://127.0.0.1:${server.port}`,
        clock: () => timestamp,
      });

      const result = await client.searchTokens({
        chains: "1,10",
        search: "weth",
      });

      const expectedSignature = createHmac("sha256", "test-secret")
        .update(
          `${timestamp}GET/api/v6/dex/market/token/search?chains=1%2C10&search=weth`,
        )
        .digest("base64");

      expect(result).toHaveLength(1);
      expect(capturedHeaders?.get("OK-ACCESS-KEY")).toBe("test-api-key");
      expect(capturedHeaders?.get("OK-ACCESS-PASSPHRASE")).toBe(
        "test-passphrase",
      );
      expect(capturedHeaders?.get("OK-ACCESS-TIMESTAMP")).toBe(timestamp);
      expect(capturedHeaders?.get("OK-ACCESS-SIGN")).toBe(expectedSignature);
    } finally {
      server.stop(true);
    }
  });

  test("signs POST requests with the raw JSON body and unwraps token balances", async () => {
    const timestamp = "2026-03-17T06:05:00.000Z";
    let capturedBody = "";
    let capturedHeaders: Headers | null = null;

    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        capturedHeaders = request.headers;
        capturedBody = await request.text();

        expect(request.method).toBe("POST");
        expect(new URL(request.url).pathname).toBe(
          "/api/v6/dex/balance/token-balances-by-address",
        );

        return Response.json({
          code: "0",
          data: [
            {
              tokenAssets: [
                {
                  chainIndex: "1",
                  tokenContractAddress: "",
                  symbol: "ETH",
                  balance: "1.5",
                  tokenPrice: "3500",
                },
              ],
            },
          ],
          msg: "success",
        });
      },
    });

    try {
      const client = new OkxOnchainClient({
        apiKey: "test-api-key",
        secret: "test-secret",
        passphrase: "test-passphrase",
        baseUrl: `http://127.0.0.1:${server.port}`,
        clock: () => timestamp,
      });

      const balances = await client.getSpecificTokenBalances({
        address: "0xabc",
        tokens: [{ chainIndex: "1", tokenContractAddress: "" }],
      });

      const expectedBody = JSON.stringify({
        address: "0xabc",
        excludeRiskToken: undefined,
        tokenContractAddresses: [{ chainIndex: "1", tokenContractAddress: "" }],
      });
      const expectedSignature = createHmac("sha256", "test-secret")
        .update(
          `${timestamp}POST/api/v6/dex/balance/token-balances-by-address${expectedBody}`,
        )
        .digest("base64");

      expect(balances).toHaveLength(1);
      expect(balances[0]?.symbol).toBe("ETH");
      expect(capturedBody).toBe(expectedBody);
      expect(capturedHeaders?.get("OK-ACCESS-SIGN")).toBe(expectedSignature);
    } finally {
      server.stop(true);
    }
  });

  test("normalizes named and numeric chain selections", () => {
    expect(resolveOkxOnchainChainIndex("eth")).toBe("1");
    expect(resolveOkxOnchainChainIndex("base")).toBe("8453");
    expect(resolveOkxOnchainChainIndex("501")).toBe("501");
    expect(resolveOkxOnchainChainSelection("ethereum,base,1").query).toBe(
      "1,8453",
    );
  });

  test("maps historical candle arrays into structured candle objects", async () => {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch() {
        return Response.json({
          code: "0",
          data: [
            ["1710000000000", "10", "12", "9", "11", "100", "1100", "1"],
            ["1709999940000", "11", "13", "10", "12", "90", "1000", "0"],
          ],
          msg: "",
        });
      },
    });

    try {
      const client = new OkxOnchainClient({
        apiKey: "test-api-key",
        secret: "test-secret",
        passphrase: "test-passphrase",
        baseUrl: `http://127.0.0.1:${server.port}`,
      });

      const candles = await client.getHistoricalCandles({
        chainIndex: "1",
        tokenContractAddress: "0x4200000000000000000000000000000000000006",
        bar: "1m",
      });

      expect(candles).toEqual([
        {
          timestamp: "1710000000000",
          open: "10",
          high: "12",
          low: "9",
          close: "11",
          volume: "100",
          volumeUsd: "1100",
          confirm: "1",
        },
        {
          timestamp: "1709999940000",
          open: "11",
          high: "13",
          low: "10",
          close: "12",
          volume: "90",
          volumeUsd: "1000",
          confirm: "0",
        },
      ]);
    } finally {
      server.stop(true);
    }
  });

  test("maps portfolio chains and accepts numeric success codes", async () => {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/api/v6/dex/market/portfolio/supported/chain") {
          return Response.json({
            code: "0",
            data: [
              {
                chainIndex: "1",
                chainName: "Ethereum",
                chainLogo: "https://example.com/eth.png",
              },
            ],
            msg: "",
          });
        }

        if (url.pathname === "/api/v6/dex/market/portfolio/token/latest-pnl") {
          expect(url.searchParams.get("tokenContractAddress")).toBe(
            "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
          );

          return Response.json({
            code: 0,
            data: {
              totalPnlUsd: "1371.68",
              totalPnlPercent: "20.22",
              isPnlSupported: true,
            },
            msg: "",
          });
        }

        return Response.json(
          { code: "404", data: null, msg: "not found" },
          { status: 404 },
        );
      },
    });

    try {
      const client = new OkxOnchainClient({
        apiKey: "test-api-key",
        secret: "test-secret",
        passphrase: "test-passphrase",
        baseUrl: `http://127.0.0.1:${server.port}`,
      });

      const chains = await client.listPortfolioSupportedChains();
      const latestPnl = await client.getPortfolioLatestPnl({
        chainIndex: "1",
        tokenContractAddress: "0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2",
        walletAddress: "0xabc",
      });

      expect(chains).toEqual([
        {
          chainIndex: "1",
          logoUrl: "https://example.com/eth.png",
          name: "Ethereum",
        },
      ]);
      expect(latestPnl?.totalPnlUsd).toBe("1371.68");
      expect(latestPnl?.totalPnlPercent).toBe("20.22");
      expect(latestPnl?.isPnlSupported).toBe(true);
    } finally {
      server.stop(true);
    }
  });
});
