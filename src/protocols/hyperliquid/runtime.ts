import type { WalletPort } from "../../core/signers";
import { HyperliquidClient, type HyperliquidClientDeps } from "./client";

const INTERNAL_HYPERLIQUID_API_URL_ENV = "WOOO_INTERNAL_HYPERLIQUID_API_URL";

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

export function resolveHyperliquidClientDeps(): HyperliquidClientDeps {
  const rawApiUrl = process.env[INTERNAL_HYPERLIQUID_API_URL_ENV]?.trim();
  if (!rawApiUrl) {
    return {};
  }

  return {
    apiUrl: normalizeApiUrl(rawApiUrl, INTERNAL_HYPERLIQUID_API_URL_ENV),
  };
}

export function createDefaultHyperliquidClient(
  address?: string,
  signer?: WalletPort,
  command?: string,
): HyperliquidClient {
  return new HyperliquidClient(
    address,
    signer,
    command,
    resolveHyperliquidClientDeps(),
  );
}
