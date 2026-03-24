import { randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import {
  deserializeSignerPayload,
  type HttpSignerMetadata,
  isSignerCommandPendingResponse,
  isSignerCommandResponse,
  type SignerCommandRequest,
  type SignerCommandTerminalResponse,
  serializeSignerPayload,
} from "../core/signer-protocol";
import { getFlagValue } from "./signer-example-utils";

function resolveChainFamily(raw: string): "evm" | "solana" | null {
  if (raw === "evm" || raw === "ethereum") return "evm";
  if (raw === "solana") return "solana";
  return null;
}

interface AdvertisedAccount {
  address: string;
  chainFamily: "evm" | "solana";
}

interface SignerRequestState {
  clientRequestId: string;
  createdAt: string;
  request: SignerCommandRequest;
  response: SignerCommandTerminalResponse | null;
  requestId: string;
}

function parsePort(args: string[]): number {
  const rawPort = getFlagValue(args, "--port") || process.env.WOOO_SIGNER_PORT;
  if (!rawPort) {
    return 8788;
  }

  const port = Number.parseInt(rawPort, 10);
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid signer port: ${rawPort}`);
  }
  return port;
}

function parseAdvertisedAccount(args: string[]): AdvertisedAccount {
  const address =
    getFlagValue(args, "--address") || process.env.WOOO_SIGNER_ADDRESS;
  if (!address?.trim()) {
    throw new Error("Signer example requires --address or WOOO_SIGNER_ADDRESS");
  }

  const rawChain =
    getFlagValue(args, "--chain") || process.env.WOOO_SIGNER_CHAIN || "evm";
  const chainFamily = resolveChainFamily(rawChain);
  if (!chainFamily) {
    throw new Error(
      `Unsupported signer chain family: ${rawChain}. Use evm or solana.`,
    );
  }

  return {
    address: address.trim(),
    chainFamily,
  };
}

function resolveAuthToken(args: string[]): string | null {
  const token =
    getFlagValue(args, "--auth-token") || process.env.WOOO_SIGNER_AUTH_TOKEN;
  if (!token?.trim()) {
    return null;
  }
  return token.trim();
}

function createMetadata(account: AdvertisedAccount): HttpSignerMetadata {
  return {
    version: 1,
    kind: "wooo-wallet-transport",
    transport: "http-signer",
    accounts: [
      {
        address: account.address,
        chainFamily: account.chainFamily,
        operations:
          account.chainFamily === "evm"
            ? [
                "sign-typed-data",
                "sign-and-send-transaction",
                "sign-protocol-payload",
              ]
            : ["sign-and-send-transaction"],
      },
    ],
  };
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function createPendingSignerResponse(requestId: string): {
  ok: true;
  pollAfterMs: number;
  requestId: string;
  status: "pending";
} {
  return {
    ok: true,
    status: "pending",
    requestId,
    pollAfterMs: 1_000,
  };
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  response.writeHead(statusCode, {
    "content-type": "application/json",
  });
  response.end(serializeSignerPayload(payload));
}

function sendSignerError(
  response: ServerResponse,
  statusCode: number,
  message: string,
): void {
  sendJson(response, statusCode, {
    ok: false,
    error: message,
  });
}

function requireAuth(
  request: IncomingMessage,
  response: ServerResponse,
  authToken: string | null,
): boolean {
  if (!authToken) {
    return true;
  }

  const header = request.headers.authorization;
  if (header === `Bearer ${authToken}`) {
    return true;
  }

  sendSignerError(response, 401, "Unauthorized");
  return false;
}

function getRequestIdFromStatusPath(pathname: string): string | null {
  const match = pathname.match(/^\/requests\/([^/]+)$/);
  return match?.[1] || null;
}

function getRequestIdFromResolvePath(pathname: string): string | null {
  const match = pathname.match(/^\/dev\/requests\/([^/]+)\/resolve$/);
  return match?.[1] || null;
}

function isTerminalSignerResponse(
  value: unknown,
): value is SignerCommandTerminalResponse {
  return (
    isSignerCommandResponse(value) && !isSignerCommandPendingResponse(value)
  );
}

function createBaseUrl(host: string, port: number): string {
  return `http://${host}:${port}`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const host = process.env.WOOO_SIGNER_HOST || "127.0.0.1";
  const port = parsePort(args);
  const account = parseAdvertisedAccount(args);
  const authToken = resolveAuthToken(args);
  const metadata = createMetadata(account);
  const requestState = new Map<string, SignerRequestState>();
  const requestIdByClientRequestId = new Map<string, string>();
  const baseUrl = createBaseUrl(host, port);
  const authHeader = authToken ? " -H 'Authorization: Bearer <token>'" : "";

  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url || "/", baseUrl);
    const pathname = requestUrl.pathname;

    if (request.method === "GET" && pathname === "/") {
      if (!requireAuth(request, response, authToken)) {
        return;
      }
      sendJson(response, 200, metadata);
      return;
    }

    if (request.method === "POST" && pathname === "/") {
      if (!requireAuth(request, response, authToken)) {
        return;
      }

      let signerRequest: SignerCommandRequest;
      try {
        signerRequest = deserializeSignerPayload<SignerCommandRequest>(
          await readRequestBody(request),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sendSignerError(response, 400, message);
        return;
      }

      const existingRequestId = requestIdByClientRequestId.get(
        signerRequest.clientRequestId,
      );
      if (existingRequestId) {
        const existingState = requestState.get(existingRequestId);
        if (!existingState) {
          sendSignerError(
            response,
            500,
            `Inconsistent signer state for clientRequestId ${signerRequest.clientRequestId}`,
          );
          return;
        }

        if (
          serializeSignerPayload(existingState.request) !==
          serializeSignerPayload(signerRequest)
        ) {
          sendSignerError(
            response,
            409,
            `clientRequestId ${signerRequest.clientRequestId} was already used for a different request`,
          );
          return;
        }

        if (existingState.response) {
          sendJson(
            response,
            existingState.response.ok ? 200 : 400,
            existingState.response,
          );
          return;
        }

        sendJson(response, 202, createPendingSignerResponse(existingRequestId));
        return;
      }

      const requestId = randomUUID();
      requestIdByClientRequestId.set(signerRequest.clientRequestId, requestId);
      requestState.set(requestId, {
        clientRequestId: signerRequest.clientRequestId,
        createdAt: new Date().toISOString(),
        request: signerRequest,
        response: null,
        requestId,
      });

      console.error(
        `Signer request ${requestId} queued for ${signerRequest.operation} (${signerRequest.account.chainFamily}:${signerRequest.account.address})`,
      );
      console.error(
        `Inspect pending requests: curl${authHeader} ${baseUrl}/dev/requests`,
      );
      console.error(
        `Resolve request: curl -X POST${authHeader} -H 'content-type: application/json' ${baseUrl}/dev/requests/${requestId}/resolve --data '{"ok":false,"error":"user rejected"}'`,
      );

      sendJson(response, 202, createPendingSignerResponse(requestId));
      return;
    }

    if (request.method === "GET" && pathname === "/dev/requests") {
      if (!requireAuth(request, response, authToken)) {
        return;
      }

      sendJson(
        response,
        200,
        Array.from(requestState.entries()).map(([requestId, state]) => ({
          requestId,
          clientRequestId: state.clientRequestId,
          createdAt: state.createdAt,
          account: state.request.account,
          operation: state.request.operation,
          status: state.response ? "completed" : "pending",
        })),
      );
      return;
    }

    const statusRequestId = getRequestIdFromStatusPath(pathname);
    if (request.method === "GET" && statusRequestId) {
      if (!requireAuth(request, response, authToken)) {
        return;
      }

      const state = requestState.get(statusRequestId);
      if (!state) {
        sendSignerError(response, 404, `Unknown requestId: ${statusRequestId}`);
        return;
      }

      if (!state.response) {
        sendJson(response, 202, createPendingSignerResponse(statusRequestId));
        return;
      }

      sendJson(response, state.response.ok ? 200 : 400, state.response);
      return;
    }

    const resolveRequestId = getRequestIdFromResolvePath(pathname);
    if (request.method === "POST" && resolveRequestId) {
      if (!requireAuth(request, response, authToken)) {
        return;
      }

      const state = requestState.get(resolveRequestId);
      if (!state) {
        sendSignerError(
          response,
          404,
          `Unknown requestId: ${resolveRequestId}`,
        );
        return;
      }
      if (state.response) {
        sendSignerError(
          response,
          409,
          `Request ${resolveRequestId} already has a terminal response`,
        );
        return;
      }

      let terminalResponse: unknown;
      try {
        terminalResponse = deserializeSignerPayload<unknown>(
          await readRequestBody(request),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sendSignerError(response, 400, message);
        return;
      }

      if (!isTerminalSignerResponse(terminalResponse)) {
        sendSignerError(
          response,
          400,
          "Resolve payload must be a terminal signer response JSON object",
        );
        return;
      }

      state.response = terminalResponse;
      console.error(`Signer request ${resolveRequestId} resolved`);
      sendJson(response, 200, {
        ok: true,
        resolved: true,
      });
      return;
    }

    sendSignerError(response, 404, "Not Found");
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  console.error(`Reference HTTP signer listening on ${baseUrl}`);
  console.error(
    `Advertised account: ${account.chainFamily}:${account.address}`,
  );
  if (authToken) {
    console.error("Signer auth: bearer token required");
  }

  await new Promise(() => {});
  server.close();
}

await main();
