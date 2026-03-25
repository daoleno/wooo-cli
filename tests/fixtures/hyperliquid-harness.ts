interface CapturedHyperliquidRequest {
  body: Record<string, unknown>;
  path: string;
}

function createJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

export class HyperliquidHarness {
  readonly requests: CapturedHyperliquidRequest[] = [];

  private server?: Bun.Server;

  get exchangeRequests(): CapturedHyperliquidRequest[] {
    return this.requests.filter((request) => request.path === "/exchange");
  }

  get infoRequests(): CapturedHyperliquidRequest[] {
    return this.requests.filter((request) => request.path === "/info");
  }

  get url(): string {
    if (!this.server) {
      throw new Error("Hyperliquid harness has not been started");
    }
    return `http://127.0.0.1:${this.server.port}`;
  }

  async start(): Promise<void> {
    this.server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: async (request) => await this.handleRequest(request),
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      await this.server.stop(true);
      this.server = undefined;
    }
  }

  private async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method !== "POST") {
      return createJsonResponse({ error: "Method not allowed" }, 405);
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return createJsonResponse({ error: message }, 400);
    }

    this.requests.push({ path: url.pathname, body });

    if (url.pathname === "/info") {
      return this.handleInfo(body);
    }

    if (url.pathname === "/exchange") {
      return this.handleExchange(body);
    }

    return createJsonResponse({ error: "Not found" }, 404);
  }

  private handleInfo(body: Record<string, unknown>): Response {
    switch (body.type) {
      case "metaAndAssetCtxs":
        return createJsonResponse([
          {
            universe: [
              {
                name: "BTC",
                maxLeverage: 50,
                onlyIsolated: false,
                szDecimals: 5,
              },
            ],
          },
          [
            {
              dayNtlVlm: "9450588.2273",
              funding: "0.0001",
              impactPxs: ["100000", "100010"],
              markPx: "100000",
              midPx: "100005",
              openInterest: "10764.48",
              oraclePx: "99950",
              premium: "0.0005",
              prevDayPx: "99000",
            },
          ],
        ]);
      case "spotMeta":
        return createJsonResponse({
          tokens: [],
        });
      case "spotMetaAndAssetCtxs":
        return createJsonResponse([
          {
            tokens: [],
            universe: [],
          },
          [],
        ]);
      case "perpDexs":
        return createJsonResponse([null]);
      case "clearinghouseState":
        return createJsonResponse({
          assetPositions: [
            {
              position: {
                coin: "BTC",
                entryPx: "99500",
                leverage: {
                  type: "cross",
                  value: "5",
                  rawUsd: "-20",
                },
                liquidationPx: "0",
                marginUsed: "20",
                maxLeverage: "50",
                positionValue: "100",
                returnOnEquity: "0.025",
                szi: "0.001",
                unrealizedPnl: "0.5",
              },
              type: "oneWay",
            },
          ],
        });
      default:
        return createJsonResponse(
          { error: `Unsupported info request type: ${String(body.type)}` },
          400,
        );
    }
  }

  private handleExchange(body: Record<string, unknown>): Response {
    const action = body.action as Record<string, unknown> | undefined;
    const actionType = action?.type;

    if (actionType === "updateLeverage") {
      return createJsonResponse({
        status: "ok",
        response: {
          type: "updateLeverage",
          data: {
            statuses: ["ok"],
          },
        },
      });
    }

    if (actionType === "order") {
      const orders = Array.isArray(action?.orders)
        ? (action.orders as Array<Record<string, unknown>>)
        : [];
      const firstOrder = orders[0] ?? {};
      const size = typeof firstOrder.s === "string" ? firstOrder.s : "0.001000";

      return createJsonResponse({
        status: "ok",
        response: {
          type: "order",
          data: {
            statuses: [
              {
                filled: {
                  oid: 777,
                  totalSz: size,
                  avgPx: "100000",
                },
              },
            ],
          },
        },
      });
    }

    return createJsonResponse(
      { error: `Unsupported exchange action: ${String(actionType)}` },
      400,
    );
  }
}
