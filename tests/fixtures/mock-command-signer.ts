import { writeFileSync } from "node:fs";
import {
  deserializeSignerPayload,
  type SignerCommandRequest,
  type SignerCommandResponse,
  serializeSignerPayload,
} from "../../src/core/signer-protocol";

const TEST_TX_HASH = `0x${"12".repeat(32)}`;
const TEST_SIGNATURE = {
  r: `0x${"34".repeat(32)}`,
  s: `0x${"56".repeat(32)}`,
  v: 27,
} as const;

function getFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  const value = args[index + 1];
  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const requestFile = getFlagValue(args, "--request-file");
  const responseFile = getFlagValue(args, "--response-file");
  if (!requestFile || !responseFile) {
    throw new Error("Expected --request-file and --response-file");
  }

  const request = deserializeSignerPayload<SignerCommandRequest>(
    await Bun.file(requestFile).text(),
  );

  if (process.env.WOOO_SIGNER_CAPTURE_PATH) {
    writeFileSync(
      process.env.WOOO_SIGNER_CAPTURE_PATH,
      JSON.stringify(
        {
          env: {
            WOOO_CONFIG_DIR: process.env.WOOO_CONFIG_DIR ?? null,
            WOOO_MASTER_PASSWORD: process.env.WOOO_MASTER_PASSWORD ?? null,
            WOOO_SIGNER_TEST_VALUE: process.env.WOOO_SIGNER_TEST_VALUE ?? null,
          },
          request: {
            kind: request.kind,
            walletName: request.wallet.name,
          },
        },
        null,
        2,
      ),
    );
  }

  const response: SignerCommandResponse =
    request.kind === "hyperliquid-sign-l1-action"
      ? { ok: true, signature: TEST_SIGNATURE }
      : { ok: true, txHash: TEST_TX_HASH };

  await Bun.write(responseFile, serializeSignerPayload(response));
}

await main();
