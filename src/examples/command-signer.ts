/**
 * Reference command-line signer example.
 *
 * This demonstrates the external signer protocol for a command-line signer.
 * The wooo CLI can invoke an external signer subprocess by writing a
 * SignerCommandRequest to a file and reading a SignerCommandResponse back.
 *
 * The actual signing logic is left as a TODO — replace the stub below with
 * your own implementation (hardware wallet, KMS, MPC service, etc.).
 *
 * Usage:
 *   bun run src/examples/command-signer.ts \
 *     --request-file <path> \
 *     --response-file <path>
 */
import { readFile, writeFile } from "node:fs/promises";
import {
  deserializeSignerPayload,
  type SignerCommandRequest,
  type SignerCommandResponse,
  serializeSignerPayload,
} from "../core/signer-protocol";
import { getFlagValue } from "./signer-example-utils";

interface ParsedArgs {
  requestFile: string;
  responseFile: string;
}

function parseArgs(args: string[]): ParsedArgs {
  const requestFile = getFlagValue(args, "--request-file");
  const responseFile = getFlagValue(args, "--response-file");

  if (!requestFile || !responseFile) {
    throw new Error(
      "Usage: bun run src/examples/command-signer.ts --request-file <path> --response-file <path>",
    );
  }

  return { requestFile, responseFile };
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
  const args = parseArgs(process.argv.slice(2));
  const request = deserializeSignerPayload<SignerCommandRequest>(
    await readFile(args.requestFile, "utf8"),
  );

  const response = await handleSignerRequest(request);
  await writeFile(args.responseFile, serializeSignerPayload(response));

  if (!response.ok) {
    process.exit(1);
  }
}

await main();
