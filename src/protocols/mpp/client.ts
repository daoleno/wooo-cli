import type { Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  getActiveLocalSecret,
  getActiveWallet,
  getActiveWalletRecord,
} from "../../core/context";
import { getPublicClient } from "../../core/evm";
import { MPP_DIRECTORY_URL, TEMPO_CHAIN_NAME } from "./constants";
import type { MppBalance, MppCallResult, MppService } from "./types";

async function createViemAccount() {
  const wallet = await getActiveWalletRecord("evm");
  if (wallet.connection.mode !== "local") {
    throw new Error(
      "MPP currently requires a local wallet. External wallet support coming soon.",
    );
  }
  const secret = await getActiveLocalSecret("evm");
  return privateKeyToAccount(secret as `0x${string}`);
}

async function createMppxClient(maxDeposit?: string) {
  const { Mppx, tempo } = await import("mppx/client");
  const account = await createViemAccount();
  // tempo() returns [charge, session] methods
  // maxDeposit caps the server's suggested deposit amount
  const methods = tempo({
    account,
    ...(maxDeposit ? { maxDeposit } : {}),
  });
  return Mppx.create({ methods, polyfill: false });
}

export class MppClient {
  async call(
    url: string,
    options?: { method?: string; body?: string; maxDeposit?: string },
  ): Promise<MppCallResult> {
    const mppx = await createMppxClient(options?.maxDeposit);
    const init: RequestInit = {};
    if (options?.method) init.method = options.method;
    if (options?.body) {
      init.body = options.body;
      init.headers = { "Content-Type": "application/json" };
    }

    const response = await mppx.fetch(url, init);
    const contentType = response.headers.get("content-type") ?? "";
    let data: unknown;
    if (contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    return {
      status: response.status,
      url,
      data,
    };
  }

  async getBalance(): Promise<MppBalance> {
    const wallet = await getActiveWallet("evm");
    const client = getPublicClient(TEMPO_CHAIN_NAME);
    const balance = await client.getBalance({
      address: wallet.address as Address,
    });
    // Tempo native currency is USD with 6 decimals
    const formatted = (Number(balance) / 1e6).toFixed(6);

    return {
      address: wallet.address,
      chain: TEMPO_CHAIN_NAME,
      nativeUSD: formatted,
      protocol: "MPP",
    };
  }

  async listServices(): Promise<MppService[]> {
    try {
      const response = await fetch(MPP_DIRECTORY_URL);
      if (!response.ok) {
        throw new Error(`Directory fetch failed: ${response.status}`);
      }
      return (await response.json()) as MppService[];
    } catch {
      // Fallback: return empty if directory is unavailable
      return [];
    }
  }
}
