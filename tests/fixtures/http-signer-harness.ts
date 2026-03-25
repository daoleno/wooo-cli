import {
  type Address,
  type Chain,
  createPublicClient,
  createWalletClient,
  type Hex,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, polygon } from "viem/chains";
import { signHyperliquidL1Action } from "../../src/core/hyperliquid-signing";
import {
  deserializeSignerPayload,
  type HttpSignerMetadata,
  type SignerCommandRequest,
  type SignerCommandResponse,
  serializeSignerPayload,
  type WalletTransportOperation,
} from "../../src/core/signer-protocol";

interface HttpSignerHarnessOptions {
  address?: string;
  authToken?: string;
  operations?: WalletTransportOperation[];
  privateKey: `0x${string}`;
  rpcUrl?: string;
}

function createJsonResponse(payload: unknown, status = 200): Response {
  return new Response(serializeSignerPayload(payload), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

function resolveViemChain(chainId: string): Chain {
  switch (chainId) {
    case "eip155:1":
      return mainnet;
    case "eip155:137":
      return polygon;
    default:
      throw new Error(
        `HTTP signer harness does not support chain ${chainId}. Add a viem chain mapping before using it in tests.`,
      );
  }
}

export class HttpSignerHarness {
  readonly account;
  readonly address: string;
  readonly authToken: string | undefined;
  readonly operations: WalletTransportOperation[];
  readonly requests: SignerCommandRequest[] = [];

  private readonly metadata: HttpSignerMetadata;
  private server?: Bun.Server;

  constructor(private readonly options: HttpSignerHarnessOptions) {
    this.account = privateKeyToAccount(options.privateKey);
    this.address = options.address ?? this.account.address;
    this.authToken = options.authToken;
    this.operations = options.operations ?? [
      "sign-typed-data",
      "sign-and-send-transaction",
      "sign-protocol-payload",
    ];
    this.metadata = {
      version: 1,
      kind: "wooo-wallet-transport",
      transport: "http-signer",
      accounts: [
        {
          address: this.address,
          chainFamily: "evm",
          operations: this.operations,
        },
      ],
    };
  }

  get url(): string {
    if (!this.server) {
      throw new Error("HTTP signer harness has not been started");
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
        const response = await this.handleSignerRequest(signerRequest);
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

  private assertAddress(address: string): void {
    if (address.toLowerCase() !== this.address.toLowerCase()) {
      throw new Error(
        `HTTP signer harness received a request for ${address}, but only ${this.address} is configured`,
      );
    }
  }

  private async handleSignerRequest(
    request: SignerCommandRequest,
  ): Promise<SignerCommandResponse> {
    this.assertAddress(request.account.address);

    if (!this.operations.includes(request.operation)) {
      return {
        ok: false,
        error: `Operation ${request.operation} is not advertised by this signer`,
      };
    }

    switch (request.operation) {
      case "sign-typed-data": {
        const signatureHex = await this.account.signTypedData({
          domain: request.typedData.domain as never,
          types: request.typedData.types as never,
          primaryType: request.typedData.primaryType as never,
          message: request.typedData.message as never,
        });
        return {
          ok: true,
          signatureHex,
        };
      }

      case "sign-protocol-payload": {
        if (request.payload.protocol !== "hyperliquid") {
          return {
            ok: false,
            error: `Unsupported protocol payload: ${request.payload.protocol}`,
          };
        }

        return {
          ok: true,
          signature: signHyperliquidL1Action(
            this.options.privateKey,
            request.payload.payload,
          ),
        };
      }

      case "sign-and-send-transaction": {
        if (!this.options.rpcUrl) {
          return {
            ok: false,
            error:
              "HTTP signer harness requires an RPC URL for sign-and-send-transaction",
          };
        }

        if (request.transaction.format !== "evm-transaction") {
          return {
            ok: false,
            error: `Unsupported transaction format: ${request.transaction.format}`,
          };
        }

        const chain = resolveViemChain(request.chainId);
        const publicClient = createPublicClient({
          chain,
          transport: http(this.options.rpcUrl),
        });
        const walletClient = createWalletClient({
          account: this.account,
          chain,
          transport: http(this.options.rpcUrl),
        });
        const to = request.transaction.to as Address;
        const data = request.transaction.data as Hex;
        const value = request.transaction.value;
        const nonce = await publicClient.getTransactionCount({
          address: this.account.address,
        });
        const gas = await publicClient.estimateGas({
          account: this.account.address,
          to,
          data,
          value,
        });
        const gasPrice = await publicClient.getGasPrice();
        const serializedTransaction = await walletClient.signTransaction({
          account: this.account,
          chain,
          chainId: chain.id,
          to,
          data,
          value,
          gas,
          gasPrice,
          nonce,
        });
        const txHash = await publicClient.sendRawTransaction({
          serializedTransaction,
        });
        return {
          ok: true,
          txHash,
        };
      }
    }
  }
}
