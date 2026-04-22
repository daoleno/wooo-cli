import { describe, expect, test } from "bun:test";

async function runCliJson<T>(
  args: string[],
  env?: Record<string, string>,
): Promise<T> {
  const proc = Bun.spawn({
    cmd: [process.execPath, "run", "src/index.ts", ...args],
    cwd: process.cwd(),
    env: {
      ...process.env,
      WOOO_OKX_API_KEY: "test-api-key",
      WOOO_OKX_API_SECRET: "test-secret",
      WOOO_OKX_BASE_URL: env?.WOOO_OKX_BASE_URL ?? "",
      WOOO_OKX_PASSPHRASE: "test-passphrase",
      ...env,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(
      `Command failed with exit code ${exitCode}: bun run src/index.ts ${args.join(
        " ",
      )}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
    );
  }

  return JSON.parse(stdout) as T;
}

async function withMockOkxAgent<T>(
  run: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);

      if (
        request.method === "POST" &&
        url.pathname === "/api/v5/aigc/mcp/market-filter"
      ) {
        const body = (await request.json()) as Record<string, unknown>;
        expect(body.instType).toBe("SWAP");
        return Response.json({
          code: "0",
          data: {
            total: 1,
            rows: [
              {
                rank: 1,
                instId: "BTC-USDT-SWAP",
                last: "65000",
                chg24hPct: "2.5",
                volUsd24h: "1000000000",
                oiUsd: "500000000",
                fundingRate: "0.0001",
                sortVal: "500000000",
              },
            ],
          },
          msg: "",
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/api/v5/aigc/mcp/oi-history"
      ) {
        return Response.json({
          code: "0",
          data: {
            instId: "BTC-USDT-SWAP",
            bar: "1H",
            rows: [
              {
                ts: "1710000000000",
                oiUsd: "500000000",
                oiDeltaUsd: "12000000",
                oiDeltaPct: "2.4",
                oiCont: "10000",
              },
            ],
          },
          msg: "",
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/api/v5/aigc/mcp/oi-change-filter"
      ) {
        return Response.json({
          code: "0",
          data: [
            {
              rank: 1,
              instId: "ETH-USDT-SWAP",
              last: "3200",
              oiUsd: "300000000",
              oiDeltaUsd: "18000000",
              oiDeltaPct: "6.0",
              pxChgPct: "1.2",
              volUsd24h: "700000000",
              fundingRate: "0.0002",
            },
          ],
          msg: "",
        });
      }

      if (
        request.method === "GET" &&
        url.pathname === "/api/v5/orbit/news-search"
      ) {
        return Response.json({
          code: "0",
          data: [
            {
              nextCursor: "cursor-1",
              details: [
                {
                  id: "news-1",
                  title: "BTC sentiment turns bullish",
                  summary: "A concise market summary",
                  cTime: "1710000000000",
                  importance: "high",
                  platformList: ["blockbeats", "techflowpost"],
                  ccyList: ["BTC"],
                  sentiment: { label: "bullish" },
                },
              ],
            },
          ],
          msg: "",
        });
      }

      if (
        request.method === "GET" &&
        url.pathname === "/api/v5/orbit/news-detail"
      ) {
        return Response.json({
          code: "0",
          data: [
            {
              id: "news-1",
              title: "BTC sentiment turns bullish",
              summary: "A concise market summary",
              content: "Full article text",
              sourceUrl: "https://example.com/news-1",
              cTime: "1710000000000",
              platformList: ["blockbeats"],
              ccyList: ["BTC"],
            },
          ],
          msg: "",
        });
      }

      if (
        request.method === "GET" &&
        url.pathname === "/api/v5/orbit/news-platform"
      ) {
        return Response.json({
          code: "0",
          data: [{ platform: ["blockbeats", "techflowpost", "panews"] }],
          msg: "",
        });
      }

      if (
        request.method === "GET" &&
        url.pathname === "/api/v5/orbit/currency-sentiment-query"
      ) {
        const includeTrend = url.searchParams.get("inclTrend") === "true";
        return Response.json({
          code: "0",
          data: [
            {
              details: [
                {
                  ccy: "BTC",
                  mentionCnt: "300",
                  sentiment: {
                    label: "bullish",
                    bullishRatio: "0.68",
                    bearishRatio: "0.12",
                  },
                  trend: includeTrend
                    ? [
                        {
                          ts: "1710000000000",
                          bullishRatio: "0.68",
                          bearishRatio: "0.12",
                          mentionCnt: "300",
                        },
                      ]
                    : undefined,
                },
              ],
            },
          ],
          msg: "",
        });
      }

      if (
        request.method === "GET" &&
        url.pathname === "/api/v5/orbit/currency-sentiment-ranking"
      ) {
        return Response.json({
          code: "0",
          data: [
            {
              details: [
                {
                  ccy: "BTC",
                  mentionCnt: "300",
                  sentiment: {
                    label: "bullish",
                    bullishRatio: "0.68",
                    bearishRatio: "0.12",
                  },
                },
              ],
            },
          ],
          msg: "",
        });
      }

      return Response.json(
        { code: "404", data: null, msg: `not found: ${url.pathname}` },
        { status: 404 },
      );
    },
  });

  try {
    return await run(`http://127.0.0.1:${server.port}`);
  } finally {
    server.stop(true);
  }
}

describe("OKX Agent CLI commands", () => {
  test("market okx Agent commands return stable JSON output", async () => {
    await withMockOkxAgent(async (baseUrl) => {
      const filter = await runCliJson<{
        provider: string;
        result: { rows: Array<{ instId: string }> };
      }>(
        [
          "market",
          "okx",
          "filter",
          "--instType",
          "SWAP",
          "--sortBy",
          "oiUsd",
          "--limit",
          "1",
          "--json",
        ],
        { WOOO_OKX_BASE_URL: baseUrl },
      );
      const history = await runCliJson<{
        provider: string;
        result: { rows: Array<{ oiDeltaPct: string }> };
      }>(
        [
          "market",
          "okx",
          "oi-history",
          "BTC-USDT-SWAP",
          "--bar",
          "1H",
          "--json",
        ],
        { WOOO_OKX_BASE_URL: baseUrl },
      );
      const oiChange = await runCliJson<{
        provider: string;
        rows: Array<{ instId: string }>;
      }>(["market", "okx", "oi-change", "--instType", "SWAP", "--json"], {
        WOOO_OKX_BASE_URL: baseUrl,
      });

      expect(filter.provider).toBe("okx-agent-market");
      expect(filter.result.rows[0]?.instId).toBe("BTC-USDT-SWAP");
      expect(history.provider).toBe("okx-agent-market");
      expect(history.result.rows[0]?.oiDeltaPct).toBe("2.4");
      expect(oiChange.provider).toBe("okx-agent-market");
      expect(oiChange.rows[0]?.instId).toBe("ETH-USDT-SWAP");
    });
  });

  test("news okx commands return stable JSON output", async () => {
    await withMockOkxAgent(async (baseUrl) => {
      const latest = await runCliJson<{
        items: Array<{ id: string; title: string }>;
        nextCursor: string | null;
        provider: string;
      }>(
        [
          "news",
          "okx",
          "latest",
          "--coins",
          "btc",
          "--lang",
          "zh-CN",
          "--limit",
          "1",
          "--json",
        ],
        { WOOO_OKX_BASE_URL: baseUrl },
      );
      const detail = await runCliJson<{
        article: { id: string; summary: string } | null;
        provider: string;
      }>(["news", "okx", "detail", "news-1", "--json"], {
        WOOO_OKX_BASE_URL: baseUrl,
      });
      const platforms = await runCliJson<{
        platforms: string[];
        provider: string;
      }>(["news", "okx", "platforms", "--json"], {
        WOOO_OKX_BASE_URL: baseUrl,
      });
      const sentiment = await runCliJson<{
        items: Array<{ ccy: string }>;
        provider: string;
      }>(["news", "okx", "coin-sentiment", "--coins", "BTC", "--json"], {
        WOOO_OKX_BASE_URL: baseUrl,
      });
      const trend = await runCliJson<{
        coin: string;
        provider: string;
        trend: Array<{ ts: string }>;
      }>(["news", "okx", "coin-trend", "BTC", "--points", "1", "--json"], {
        WOOO_OKX_BASE_URL: baseUrl,
      });
      const rank = await runCliJson<{
        items: Array<{ ccy: string }>;
        provider: string;
      }>(["news", "okx", "sentiment-rank", "--sortBy", "bullish", "--json"], {
        WOOO_OKX_BASE_URL: baseUrl,
      });

      expect(latest.provider).toBe("okx-agent-news");
      expect(latest.items[0]?.id).toBe("news-1");
      expect(latest.nextCursor).toBe("cursor-1");
      expect(detail.article?.summary).toBe("A concise market summary");
      expect(platforms.platforms).toContain("techflowpost");
      expect(sentiment.items[0]?.ccy).toBe("BTC");
      expect(trend.coin).toBe("BTC");
      expect(trend.trend[0]?.ts).toBe("1710000000000");
      expect(rank.items[0]?.ccy).toBe("BTC");
    });
  });
});
