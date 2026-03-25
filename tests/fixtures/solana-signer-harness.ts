import bs58 from "bs58";
import {
  deserializeSignerPayload,
  type HttpSignerMetadata,
  type SignerCommandRequest,
  type SignerCommandResponse,
  serializeSignerPayload,
} from "../../src/core/signer-protocol";

interface SolanaSignerHarnessOptions {
  address: string;
  authToken?: string;
  txHash?: string;
}

function createJsonResponse(payload: unknown, status = 200): Response {
  return new Response(serializeSignerPayload(payload), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

export class SolanaSignerHarness {
  readonly address: string;
  readonly authToken: string | undefined;
  readonly requests: SignerCommandRequest[] = [];
  readonly txHash: string;

  private readonly metadata: HttpSignerMetadata;
  private server?: Bun.Server;

  constructor(readonly options: SolanaSignerHarnessOptions) {
    this.address = options.address;
    this.authToken = options.authToken;
    this.txHash = options.txHash ?? bs58.encode(Buffer.alloc(64, 1));
    this.metadata = {
      version: 1,
      kind: "wooo-wallet-transport",
      transport: "http-signer",
      accounts: [
        {
          address: this.address,
          chainFamily: "solana",
          operations: ["sign-and-send-transaction"],
        },
      ],
    };
  }

  get url(): string {
    if (!this.server) {
      throw new Error("Solana signer harness has not been started");
    }
    return this.server.url.toString();
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

  private isAuthorized(request: Request): boolean {
    if (!this.authToken) {
      return true;
    }
    return request.headers.get("authorization") === `Bearer ${this.authToken}`;
  }

  private async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (!this.isAuthorized(request)) {
      return createJsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    if (request.method === "GET" && url.pathname === "/") {
      return createJsonResponse(this.metadata);
    }

    if (request.method === "POST" && url.pathname === "/") {
      try {
        const signerRequest = deserializeSignerPayload<SignerCommandRequest>(
          await request.text(),
        );
        this.requests.push(signerRequest);
        const response = this.handleSignerRequest(signerRequest);
        return createJsonResponse(response, response.ok ? 200 : 400);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return createJsonResponse({ ok: false, error: message }, 400);
      }
    }

    return createJsonResponse(
      {
        ok: false,
        error: `Unsupported route: ${request.method} ${url.pathname}`,
      },
      404,
    );
  }

  private handleSignerRequest(
    request: SignerCommandRequest,
  ): SignerCommandResponse {
    if (request.account.address !== this.address) {
      return {
        ok: false,
        error: `Signer request address mismatch: ${request.account.address}`,
      };
    }

    if (request.operation !== "sign-and-send-transaction") {
      return {
        ok: false,
        error: `Unsupported operation: ${request.operation}`,
      };
    }

    if (request.transaction.format !== "solana-versioned-transaction") {
      return {
        ok: false,
        error: `Unsupported transaction format: ${request.transaction.format}`,
      };
    }

    return {
      ok: true,
      txHash: this.txHash,
    };
  }
}
