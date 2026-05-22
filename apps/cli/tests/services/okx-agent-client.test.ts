import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { OkxAgentClient } from "../../src/services/okx-agent/client";

describe("OKX Agent client", () => {
  test("calls public market filter endpoint without auth headers", async () => {
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
          "/api/v5/aigc/mcp/market-filter",
        );

        return Response.json({
          code: "0",
          data: {
            total: 1,
            rows: [{ instId: "BTC-USDT-SWAP", oiUsd: "1000000" }],
          },
          msg: "",
        });
      },
    });

    try {
      const client = new OkxAgentClient({
        baseUrl: `http://127.0.0.1:${server.port}`,
      });

      const result = await client.marketFilter({
        instType: "SWAP",
        limit: 1,
        sortBy: "oiUsd",
      });

      expect(result.rows?.[0]?.instId).toBe("BTC-USDT-SWAP");
      expect(JSON.parse(capturedBody)).toEqual({
        instType: "SWAP",
        limit: 1,
        sortBy: "oiUsd",
      });
      expect(capturedHeaders?.get("OK-ACCESS-KEY")).toBeNull();
    } finally {
      server.stop(true);
    }
  });

  test("signs private news requests with query string and language header", async () => {
    const timestamp = "2026-04-22T08:00:00.000Z";
    let capturedHeaders: Headers | null = null;
    let capturedUrl = "";

    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        capturedHeaders = request.headers;
        capturedUrl = request.url;
        const url = new URL(request.url);

        expect(url.pathname).toBe("/api/v5/orbit/news-search");
        expect(url.searchParams.get("ccyList")).toBe("BTC");
        expect(url.searchParams.get("limit")).toBe("3");
        expect(url.searchParams.get("sortBy")).toBe("latest");

        return Response.json({
          code: "0",
          data: [
            {
              details: [{ id: "news-1", title: "BTC sentiment flips" }],
              nextCursor: "next-1",
            },
          ],
          msg: "",
        });
      },
    });

    try {
      const client = new OkxAgentClient({
        apiKey: "test-key",
        baseUrl: `http://127.0.0.1:${server.port}`,
        clock: () => timestamp,
        passphrase: "test-pass",
        secret: "test-secret",
      });

      const page = await client.getNewsLatest({
        coins: "BTC",
        language: "zh-CN",
        limit: 3,
      });

      const url = new URL(capturedUrl);
      const requestPath = `${url.pathname}${url.search}`;
      const expectedSignature = createHmac("sha256", "test-secret")
        .update(`${timestamp}GET${requestPath}`)
        .digest("base64");

      expect(page?.details?.[0]?.title).toBe("BTC sentiment flips");
      expect(page?.nextCursor).toBe("next-1");
      expect(capturedHeaders?.get("Accept-Language")).toBe("zh-CN");
      expect(capturedHeaders?.get("OK-ACCESS-KEY")).toBe("test-key");
      expect(capturedHeaders?.get("OK-ACCESS-PASSPHRASE")).toBe("test-pass");
      expect(capturedHeaders?.get("OK-ACCESS-TIMESTAMP")).toBe(timestamp);
      expect(capturedHeaders?.get("OK-ACCESS-SIGN")).toBe(expectedSignature);
    } finally {
      server.stop(true);
    }
  });

  test("unwraps news platforms from OKX array payload", async () => {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch() {
        return Response.json({
          code: "0",
          data: [{ platform: ["blockbeats", "techflowpost", "panews"] }],
          msg: "",
        });
      },
    });

    try {
      const client = new OkxAgentClient({
        apiKey: "test-key",
        baseUrl: `http://127.0.0.1:${server.port}`,
        passphrase: "test-pass",
        secret: "test-secret",
      });

      await expect(client.listNewsPlatforms()).resolves.toEqual([
        "blockbeats",
        "techflowpost",
        "panews",
      ]);
    } finally {
      server.stop(true);
    }
  });
});
