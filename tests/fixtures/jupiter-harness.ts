interface CapturedJupiterQuoteRequest {
  amount: string;
  inputMint: string;
  outputMint: string;
  slippageBps: string;
}

interface CapturedJupiterSwapRequest {
  quoteResponse: Record<string, unknown>;
  userPublicKey: string;
  wrapAndUnwrapSol: boolean;
}

function createJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

export class JupiterApiHarness {
  readonly quoteRequests: CapturedJupiterQuoteRequest[] = [];
  readonly swapRequests: CapturedJupiterSwapRequest[] = [];

  private server?: Bun.Server;

  get url(): string {
    if (!this.server) {
      throw new Error("Jupiter API harness has not been started");
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

    if (request.method === "GET" && url.pathname === "/quote") {
      this.quoteRequests.push({
        amount: url.searchParams.get("amount") ?? "",
        inputMint: url.searchParams.get("inputMint") ?? "",
        outputMint: url.searchParams.get("outputMint") ?? "",
        slippageBps: url.searchParams.get("slippageBps") ?? "",
      });

      return createJsonResponse({
        outAmount: "15250000",
        priceImpactPct: "0.0012",
        routePlan: [
          {
            swapInfo: {
              label: "Local Jupiter Route",
            },
          },
        ],
      });
    }

    if (request.method === "POST" && url.pathname === "/swap") {
      const body = (await request.json()) as CapturedJupiterSwapRequest;
      this.swapRequests.push(body);

      return createJsonResponse({
        swapTransaction: Buffer.from("local-jupiter-swap").toString("base64"),
      });
    }

    return createJsonResponse({ error: "Not found" }, 404);
  }
}

export class SolanaRpcHarness {
  readonly signatureStatusRequests: string[][] = [];

  private readonly confirmedSignatures = new Set<string>();
  private server?: Bun.Server;

  get url(): string {
    if (!this.server) {
      throw new Error("Solana RPC harness has not been started");
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

  markConfirmed(signature: string): void {
    this.confirmedSignatures.add(signature);
  }

  private async handleRequest(request: Request): Promise<Response> {
    const payload = (await request.json()) as {
      id?: number | string;
      jsonrpc?: string;
      method?: string;
      params?: unknown[];
    };

    if (payload.method === "getSignatureStatuses") {
      const signatures = Array.isArray(payload.params?.[0])
        ? (payload.params?.[0] as string[])
        : [];
      this.signatureStatusRequests.push(signatures);

      return createJsonResponse({
        jsonrpc: "2.0",
        id: payload.id ?? 1,
        result: {
          context: { slot: 1 },
          value: signatures.map((signature) =>
            this.confirmedSignatures.has(signature)
              ? {
                  confirmationStatus: "confirmed",
                  confirmations: 0,
                  err: null,
                  slot: 1,
                  status: { Ok: null },
                }
              : null,
          ),
        },
      });
    }

    return createJsonResponse(
      {
        jsonrpc: "2.0",
        id: payload.id ?? 1,
        error: {
          code: -32601,
          message: `Unsupported RPC method: ${String(payload.method)}`,
        },
      },
      400,
    );
  }
}
