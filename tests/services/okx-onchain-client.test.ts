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
});
