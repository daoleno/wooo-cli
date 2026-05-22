import type { Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getActivePrivateKey, getActiveWallet } from "../../core/context";
import { getPublicClient } from "../../core/evm";
import {
  CHAIN_TO_X402_NETWORK,
  DEFAULT_CHAIN,
  USDC_ABI,
  USDC_ADDRESSES,
  USDC_DECIMALS,
  X402_VERSION,
} from "./constants";
import type { X402Balance, X402CallResult } from "./types";

async function getLocalAccount() {
  const secret = await getActivePrivateKey("evm");
  return privateKeyToAccount(secret as `0x${string}`);
}

export class X402Client {
  async call(
    url: string,
    options?: { method?: string; body?: string; chain?: string },
  ): Promise<X402CallResult> {
    const chain = options?.chain ?? DEFAULT_CHAIN;
    const network = CHAIN_TO_X402_NETWORK[chain] ?? chain;
    const account = await getLocalAccount();

    const { createPaymentHeader, selectPaymentRequirements } = await import(
      "x402/client"
    );

    // Initial request
    const init: RequestInit = {};
    if (options?.method) init.method = options.method;
    if (options?.body) {
      init.body = options.body;
      init.headers = { "Content-Type": "application/json" };
    }

    const response = await fetch(url, init);

    // If not 402, return directly
    if (response.status !== 402) {
      return {
        status: response.status,
        url,
        chain,
        data: await parseResponseData(response),
      };
    }

    // Parse payment requirements from 402 response body
    // Standard x402 format: { x402Version: 1, accepts: PaymentRequirements[] }
    let body: { x402Version?: number; accepts?: unknown[] };
    try {
      body = (await response.json()) as {
        x402Version?: number;
        accepts?: unknown[];
      };
    } catch {
      return {
        status: 402,
        url,
        chain,
        data: { error: "402 received but response body is not valid JSON" },
      };
    }

    if (
      !body.accepts ||
      !Array.isArray(body.accepts) ||
      body.accepts.length === 0
    ) {
      return {
        status: 402,
        url,
        chain,
        data: {
          error: "402 received but no payment requirements in response body",
        },
      };
    }

    const version = body.x402Version ?? X402_VERSION;
    const selected = selectPaymentRequirements(
      body.accepts as Parameters<typeof selectPaymentRequirements>[0],
      network as Parameters<typeof selectPaymentRequirements>[1],
    );

    // Create signed payment header using viem LocalAccount (compatible with x402 EvmSigner)
    const paymentSignature = await createPaymentHeader(
      account as Parameters<typeof createPaymentHeader>[0],
      version,
      selected,
    );

    // Retry with payment
    const retryInit: RequestInit = {
      ...init,
      headers: {
        ...(init.headers as Record<string, string>),
        "x-payment": paymentSignature,
      },
    };
    const paidResponse = await fetch(url, retryInit);

    return {
      status: paidResponse.status,
      url,
      chain,
      data: await parseResponseData(paidResponse),
    };
  }

  async getBalance(chain = DEFAULT_CHAIN): Promise<X402Balance> {
    const wallet = await getActiveWallet("evm");
    const usdcAddress = USDC_ADDRESSES[chain];

    if (!usdcAddress) {
      return {
        address: wallet.address,
        chain,
        usdc: "N/A (unsupported chain)",
        protocol: "x402",
      };
    }

    const client = getPublicClient(chain);
    const balance = (await client.readContract({
      address: usdcAddress,
      abi: USDC_ABI,
      functionName: "balanceOf",
      args: [wallet.address as Address],
    })) as bigint;

    const formatted = (Number(balance) / 10 ** USDC_DECIMALS).toFixed(
      USDC_DECIMALS,
    );

    return {
      address: wallet.address,
      chain,
      usdc: formatted,
      protocol: "x402",
    };
  }
}

async function parseResponseData(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return await response.json();
  }
  return await response.text();
}
