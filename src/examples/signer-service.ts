import { createServer } from "node:http";
import { getAccountAddress } from "../core/evm";
import {
  authorizeSignerRequest,
  executeSignerRequest,
  recordSignerAudit,
} from "../core/signer-backend";
import {
  deserializeSignerPayload,
  type SignerCommandRequest,
  type SignerCommandResponse,
  type SignerServiceMetadata,
  serializeSignerPayload,
} from "../core/signer-protocol";
import { getSolanaAddress } from "../core/solana";
import { resolveWalletType } from "../core/wallet-store";
import { getFlagValue, resolveSignerSecret } from "./signer-example-utils";

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

function parseServiceWalletType(args: string[]): "evm" | "solana" {
  const rawChain =
    getFlagValue(args, "--chain") || process.env.WOOO_SIGNER_CHAIN;
  if (!rawChain) {
    return "evm";
  }

  const walletType = resolveWalletType(rawChain);
  if (!walletType) {
    throw new Error(
      `Unsupported signer service wallet type: ${rawChain}. Use evm or solana.`,
    );
  }

  return walletType;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const secretFile = getFlagValue(args, "--secret-file");
  const host = process.env.WOOO_SIGNER_HOST || "127.0.0.1";
  const port = parsePort(args);
  const walletType = parseServiceWalletType(args);
  let cachedSecretPromise: Promise<string> | null = null;

  function getSecret(): Promise<string> {
    cachedSecretPromise ??= resolveSignerSecret({ secretFile });
    return cachedSecretPromise;
  }

  async function createMetadata(): Promise<SignerServiceMetadata> {
    const secret = await getSecret();
    const address =
      walletType === "evm"
        ? getAccountAddress(secret)
        : getSolanaAddress(secret).toBase58();

    return {
      version: 1,
      kind: "wooo-signer-service",
      wallets: [
        {
          address,
          chain: walletType,
        },
      ],
      supportedKinds:
        walletType === "evm"
          ? [
              "evm-sign-typed-data",
              "evm-write-contract",
              "hyperliquid-sign-l1-action",
            ]
          : ["solana-send-versioned-transaction"],
    };
  }

  const server = createServer(async (request, response) => {
    if (request.method === "GET") {
      response.writeHead(200, {
        "content-type": "application/json",
      });
      response.end(serializeSignerPayload(await createMetadata()));
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

    let signerResult: SignerCommandResponse;
    let autoApproved = false;
    try {
      autoApproved = await authorizeSignerRequest(signerRequest);
      signerResult = await executeSignerRequest(
        signerRequest,
        await getSecret(),
      );
      recordSignerAudit(signerRequest, "approved", autoApproved);
    } catch (error) {
      signerResult = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
      recordSignerAudit(
        signerRequest,
        "rejected",
        autoApproved,
        signerResult.error,
      );
    }

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

  await new Promise(() => {});
  server.close();
}

await main();
