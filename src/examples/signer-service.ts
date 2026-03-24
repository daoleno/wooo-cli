/**
 * Reference external signer service example.
 *
 * This demonstrates the external signer service protocol. The service exposes
 * two endpoints:
 *   GET  /  → SignerServiceMetadata  (advertise wallets and supported kinds)
 *   POST /  → SignerCommandResponse  (execute a signing request)
 *
 * The actual signing logic is left as a TODO — replace the stub below with
 * your own implementation (hardware wallet, KMS, MPC service, etc.).
 *
 * Usage:
 *   bun run src/examples/signer-service.ts [--port 8787] [--address 0x...] [--chain evm|solana]
 */
import { createServer } from "node:http";
import {
  deserializeSignerPayload,
  type SignerCommandRequest,
  type SignerCommandResponse,
  type SignerServiceMetadata,
  serializeSignerPayload,
} from "../core/signer-protocol";
import { getFlagValue } from "./signer-example-utils";

function parsePort(args: string[]): number {
  const rawPort = getFlagValue(args, "--port") || process.env.WOOO_SIGNER_PORT;
  if (!rawPort) {
    return 8787;
  }

  const port = Number.parseInt(rawPort, 10);
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid signer service port: ${rawPort}`);
  }
  return port;
}

function parseChain(args: string[]): "evm" | "solana" {
  const raw = getFlagValue(args, "--chain") || process.env.WOOO_SIGNER_CHAIN;
  if (!raw || raw === "evm") return "evm";
  if (raw === "solana") return "solana";
  throw new Error(
    `Unsupported signer service wallet type: ${raw}. Use evm or solana.`,
  );
}

function parseAddress(args: string[]): string {
  const address =
    getFlagValue(args, "--address") || process.env.WOOO_SIGNER_ADDRESS;
  if (!address?.trim()) {
    throw new Error(
      "Signer service example requires --address or WOOO_SIGNER_ADDRESS",
    );
  }
  return address.trim();
}

function createMetadata(
  address: string,
  chain: "evm" | "solana",
): SignerServiceMetadata {
  return {
    version: 1,
    kind: "wooo-signer-service",
    wallets: [{ address, chain }],
    supportedKinds:
      chain === "evm"
        ? [
            "evm-sign-typed-data",
            "evm-write-contract",
            "hyperliquid-sign-l1-action",
          ]
        : ["solana-send-versioned-transaction"],
  };
}

/**
 * TODO: Replace this stub with your actual signing implementation.
 *
 * The request contains all the information needed to sign:
 *   - request.kind — the type of signing operation
 *   - request.wallet — the target wallet (address + chain)
 *   - request-specific fields (e.g. request.tx for evm-write-contract)
 *
 * Return a SignerCommandResponse with ok: true and the result, or ok: false
 * and an error message if the request is rejected.
 */
async function handleSignerRequest(
  request: SignerCommandRequest,
): Promise<SignerCommandResponse> {
  // Example: reject everything — replace with real signing logic.
  console.error(
    `Received ${request.kind} request for ${request.wallet.chain}:${request.wallet.address}`,
  );
  return {
    ok: false,
    error: "Not implemented — replace this stub with your signing logic",
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const host = process.env.WOOO_SIGNER_HOST || "127.0.0.1";
  const port = parsePort(args);
  const chain = parseChain(args);
  const address = parseAddress(args);
  const metadata = createMetadata(address, chain);

  const server = createServer(async (request, response) => {
    if (request.method === "GET") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(serializeSignerPayload(metadata));
      return;
    }

    if (request.method !== "POST") {
      response.writeHead(405, {
        "content-type": "text/plain; charset=utf-8",
      });
      response.end("Method Not Allowed");
      return;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    let signerRequest: SignerCommandRequest;
    try {
      signerRequest = deserializeSignerPayload<SignerCommandRequest>(
        Buffer.concat(chunks).toString("utf8"),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      response.writeHead(400, {
        "content-type": "text/plain; charset=utf-8",
      });
      response.end(message);
      return;
    }

    const signerResult = await handleSignerRequest(signerRequest);

    response.writeHead(signerResult.ok ? 200 : 400, {
      "content-type": "application/json",
    });
    response.end(serializeSignerPayload(signerResult));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  console.error(`Reference signer service listening on http://${host}:${port}`);
  console.error(`Advertised wallet: ${chain}:${address}`);

  await new Promise(() => {});
  server.close();
}

await main();
