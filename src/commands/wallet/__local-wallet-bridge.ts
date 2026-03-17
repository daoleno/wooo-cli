import { defineCommand } from "citty";
import { getConfigDir } from "../../core/config";
import {
  authorizeSignerRequest,
  executeSignerRequest,
  recordSignerAudit,
} from "../../core/signer-backend";
import {
  deserializeSignerPayload,
  type SignerCommandRequest,
  type SignerCommandResponse,
  serializeSignerPayload,
} from "../../core/signer-protocol";
import { WalletStore } from "../../core/wallet-store";

async function resolveMasterPassword(): Promise<string> {
  if (process.env.WOOO_MASTER_PASSWORD) {
    return process.env.WOOO_MASTER_PASSWORD;
  }

  if (!process.stdin.isTTY) {
    throw new Error("Set WOOO_MASTER_PASSWORD for local wallet signing");
  }

  const clack = await import("@clack/prompts");
  const value = await clack.password({
    message: "Enter WOOO master password:",
  });
  if (!value || typeof value === "symbol") {
    throw new Error("No master password provided");
  }
  return value;
}

async function resolveLocalSecret(walletName: string): Promise<string> {
  const store = new WalletStore(`${getConfigDir()}/keystore`);
  const secret = await store.getLocalSecret(
    walletName,
    await resolveMasterPassword(),
  );
  if (!secret) {
    throw new Error(`Local secret not found for wallet "${walletName}"`);
  }
  return secret;
}

export default defineCommand({
  meta: {
    name: "__local-wallet-bridge",
    description: "Internal local wallet bridge",
  },
  args: {
    "request-file": {
      type: "string",
      required: true,
      description: "Path to signer request JSON",
    },
    "response-file": {
      type: "string",
      required: true,
      description: "Path to signer response JSON",
    },
  },
  async run({ args }) {
    const request = deserializeSignerPayload<SignerCommandRequest>(
      await Bun.file(args["request-file"]).text(),
    );

    let response: SignerCommandResponse;
    let autoApproved = false;
    try {
      autoApproved = await authorizeSignerRequest(request);
      response = await executeSignerRequest(
        request,
        await resolveLocalSecret(request.wallet.name),
      );
      recordSignerAudit(request, "approved", autoApproved);
    } catch (error) {
      response = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
      recordSignerAudit(request, "rejected", autoApproved, response.error);
    }

    await Bun.write(args["response-file"], serializeSignerPayload(response));
    if (!response.ok) {
      process.exit(1);
    }
  },
});
