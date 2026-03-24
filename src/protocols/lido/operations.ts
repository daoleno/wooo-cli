import { getActiveSigner } from "../../core/context";
import {
  createExecutionPlan,
  createTransactionStep,
} from "../../core/execution-plan";
import type { WoooSigner } from "../../core/signers";
import type { WriteOperation } from "../../core/write-operation";
import { LidoClient } from "./client";
import type { LidoStakeResult } from "./types";

export interface LidoStakeParams {
  amount: number;
}

export interface PreparedLidoStake extends LidoStakeParams {}

export function createLidoStakeOperation(
  params: LidoStakeParams,
): WriteOperation<PreparedLidoStake, WoooSigner, LidoStakeResult> {
  return {
    protocol: "lido",
    prepare: async () => params,
    createPreview: (prepared) => ({
      action: `Stake ${prepared.amount} ETH via Lido -> ~${prepared.amount} stETH`,
      details: {
        amountETH: prepared.amount,
        estimatedStETH: prepared.amount,
        protocol: "Lido",
        chain: "ethereum",
      },
    }),
    createPlan: (prepared) =>
      createExecutionPlan({
        summary: `Stake ${prepared.amount} ETH via Lido`,
        group: "stake",
        protocol: "lido",
        command: "stake",
        chain: "ethereum",
        accountType: "evm",
        steps: [
          createTransactionStep("Submit staking transaction", {
            amountETH: prepared.amount,
            estimatedStETH: prepared.amount,
            method: "stakeEth",
          }),
        ],
        metadata: {
          displayName: "Lido",
          amountETH: prepared.amount,
          estimatedStETH: prepared.amount,
        },
      }),
    resolveAuth: async () => await getActiveSigner("evm"),
    execute: async (prepared, signer) => {
      const client = new LidoClient(signer);
      return await client.stake(prepared.amount);
    },
  };
}
