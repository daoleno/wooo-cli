import {
  authorizeSignerRequest,
  executeSignerRequest,
  recordSignerAudit,
} from "../core/signer-backend";
import {
  deserializeSignerPayload,
  type SignerCommandRequest,
  type SignerCommandResponse,
  serializeSignerPayload,
} from "../core/signer-protocol";
import { getFlagValue, resolveSignerSecret } from "./signer-example-utils";

interface ParsedArgs {
  requestFile: string;
  responseFile: string;
  secretFile?: string;
}

function parseArgs(args: string[]): ParsedArgs {
  const requestFile = getFlagValue(args, "--request-file");
  const responseFile = getFlagValue(args, "--response-file");
  const secretFile = getFlagValue(args, "--secret-file");

  if (!requestFile || !responseFile) {
    throw new Error(
      "Usage: bun run src/examples/command-signer.ts --request-file <path> --response-file <path> [--secret-file <path>]",
    );
  }

  return {
    requestFile,
    responseFile,
    ...(secretFile ? { secretFile } : {}),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const request = deserializeSignerPayload<SignerCommandRequest>(
    await Bun.file(args.requestFile).text(),
  );

  let response: SignerCommandResponse;
  let autoApproved = false;
  try {
    autoApproved = await authorizeSignerRequest(request);
    response = await executeSignerRequest(
      request,
      await resolveSignerSecret({ secretFile: args.secretFile }),
    );
    recordSignerAudit(request, "approved", autoApproved);
  } catch (error) {
    response = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    recordSignerAudit(request, "rejected", autoApproved, response.error);
  }

  await Bun.write(args.responseFile, serializeSignerPayload(response));
  if (!response.ok) {
    process.exit(1);
  }
}

await main();
