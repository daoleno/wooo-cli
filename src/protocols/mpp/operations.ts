import { getActiveEvmSigner } from "../../core/context";
import {
  createExecutionPlan,
  createTransactionStep,
} from "../../core/execution-plan";
import type { EvmSigner } from "../../core/signers";
import type { WriteOperation } from "../../core/write-operation";
import { MppClient } from "./client";
import { TEMPO_CHAIN_NAME } from "./constants";
import type { MppCallResult } from "./types";

export interface MppCallParams {
  url: string;
  method?: string;
  body?: string;
  maxDeposit?: string;
}

export function createMppCallOperation(
  params: MppCallParams,
): WriteOperation<MppCallParams, EvmSigner, MppCallResult> {
  return {
    protocol: "mpp",
    prepare: async () => params,
    createPreview: (prepared) => ({
      action: `MPP request: ${prepared.method ?? "GET"} ${prepared.url}`,
      details: {
        url: prepared.url,
        method: prepared.method ?? "GET",
        maxDeposit: prepared.maxDeposit ?? "auto",
        protocol: "MPP (Tempo)",
      },
    }),
    createPlan: (prepared) =>
      createExecutionPlan({
        summary: `MPP authenticated request to ${prepared.url}`,
        group: "pay",
        protocol: "mpp",
        command: "call",
        chain: TEMPO_CHAIN_NAME,
        accountType: "evm",
        steps: [
          createTransactionStep("Sign payment credential", {
            url: prepared.url,
            method: prepared.method ?? "GET",
            maxDeposit: prepared.maxDeposit ?? "auto",
          }),
        ],
        metadata: {
          displayName: "Machine Payments Protocol",
          url: prepared.url,
        },
      }),
    resolveAuth: async () => await getActiveEvmSigner(),
    execute: async (prepared) => {
      const client = new MppClient();
      return await client.call(prepared.url, {
        method: prepared.method,
        body: prepared.body,
        maxDeposit: prepared.maxDeposit,
      });
    },
  };
}
