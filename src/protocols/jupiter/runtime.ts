import type { WalletPort } from "../../core/signers";
import { getSolanaConnection } from "../../core/solana";
import { JupiterClient, type JupiterClientDeps } from "./client";

const INTERNAL_JUPITER_API_URL_ENV = "WOOO_INTERNAL_JUPITER_API_URL";

function normalizeApiUrl(rawUrl: string, envKey: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid ${envKey} value: ${message}`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(
      `${envKey} must use http:// or https://, received ${url.protocol}.`,
    );
  }

  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}

export function resolveJupiterClientDeps(): JupiterClientDeps {
  const rawApiUrl = process.env[INTERNAL_JUPITER_API_URL_ENV]?.trim();
  return {
    ...(rawApiUrl
      ? {
          apiUrl: normalizeApiUrl(rawApiUrl, INTERNAL_JUPITER_API_URL_ENV),
        }
      : {}),
    connection: getSolanaConnection(),
  };
}

export function createDefaultJupiterClient(signer?: WalletPort): JupiterClient {
  return new JupiterClient(signer, resolveJupiterClientDeps());
}
