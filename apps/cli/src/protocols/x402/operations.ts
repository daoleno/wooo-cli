import { getActiveWalletPort } from "../../core/context";
import {
  createExecutionPlan,
  createTransactionStep,
} from "../../core/execution-plan";
import type { WalletPort } from "../../core/signers";
import type { WriteOperation } from "../../core/write-operation";
import { X402Client } from "./client";
import { DEFAULT_CHAIN } from "./constants";
import type { X402CallResult } from "./types";

export interface X402CallParams {
  url: string;
  method?: string;
  body?: string;
  chain?: string;
}

export function createX402CallOperation(
  params: X402CallParams,
): WriteOperation<X402CallParams, WalletPort, X402CallResult> {
  return {
    protocol: "x402",
    prepare: async () => params,
    createPreview: (prepared) => ({
      action: `x402 request: ${prepared.method ?? "GET"} ${prepared.url}`,
      details: {
        url: prepared.url,
        method: prepared.method ?? "GET",
        chain: prepared.chain ?? DEFAULT_CHAIN,
        protocol: "x402",
      },
    }),
    createPlan: (prepared) =>
      createExecutionPlan({
        summary: `x402 authenticated request to ${prepared.url}`,
        group: "pay",
        protocol: "x402",
        command: "call",
        chain: prepared.chain ?? DEFAULT_CHAIN,
        accountType: "evm",
        steps: [
          createTransactionStep("Sign EIP-712 payment authorization", {
            url: prepared.url,
            method: prepared.method ?? "GET",
            chain: prepared.chain ?? DEFAULT_CHAIN,
          }),
        ],
        metadata: {
          displayName: "x402 Payment Protocol",
          url: prepared.url,
        },
      }),
    resolveAuth: async () => await getActiveWalletPort("evm"),
    execute: async (prepared) => {
      const client = new X402Client();
      return await client.call(prepared.url, {
        method: prepared.method,
        body: prepared.body,
        chain: prepared.chain,
      });
    },
  };
}
