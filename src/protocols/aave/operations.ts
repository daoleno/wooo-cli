import { getActivePrivateKey } from "../../core/context";
import {
  createApprovalStep,
  createExecutionPlan,
  createTransactionStep,
} from "../../core/execution-plan";
import type { WriteOperation } from "../../core/write-operation";
import { AaveClient } from "./client";
import type { AaveBorrowResult, AaveSupplyResult } from "./types";

export interface AaveSupplyParams {
  amount: number;
  chain: string;
  token: string;
}

export interface AaveBorrowParams {
  amount: number;
  chain: string;
  token: string;
}

export interface PreparedAaveSupply extends AaveSupplyParams {}

export interface PreparedAaveBorrow extends AaveBorrowParams {}

export function createAaveSupplyOperation(
  params: AaveSupplyParams,
): WriteOperation<PreparedAaveSupply, string, AaveSupplyResult> {
  return {
    protocol: "aave",
    prepare: async () => params,
    createPreview: (prepared) => ({
      action: `Supply ${prepared.amount} ${prepared.token} to Aave V3`,
      details: {
        token: prepared.token,
        amount: prepared.amount,
        chain: prepared.chain,
        protocol: "Aave V3",
      },
    }),
    createPlan: (prepared) =>
      createExecutionPlan({
        summary: `Supply ${prepared.amount} ${prepared.token} to Aave V3`,
        group: "lend",
        protocol: "aave",
        command: "supply",
        chain: prepared.chain,
        accountType: "evm",
        steps: [
          createApprovalStep("Approve token spend", {
            token: prepared.token,
            amount: prepared.amount,
            spender: "Aave Pool",
          }),
          createTransactionStep("Submit supply transaction", {
            token: prepared.token,
            amount: prepared.amount,
            method: "supply",
          }),
        ],
        metadata: {
          displayName: "Aave V3",
          token: prepared.token,
          amount: prepared.amount,
        },
      }),
    resolveAuth: async () => await getActivePrivateKey("evm"),
    execute: async (prepared, privateKey) => {
      const client = new AaveClient(prepared.chain, privateKey);
      return await client.supply(prepared.token, prepared.amount);
    },
  };
}

export function createAaveBorrowOperation(
  params: AaveBorrowParams,
): WriteOperation<PreparedAaveBorrow, string, AaveBorrowResult> {
  return {
    protocol: "aave",
    prepare: async () => params,
    createPreview: (prepared) => ({
      action: `Borrow ${prepared.amount} ${prepared.token} from Aave V3`,
      details: {
        token: prepared.token,
        amount: prepared.amount,
        chain: prepared.chain,
        protocol: "Aave V3",
        rateMode: "variable",
      },
    }),
    createPlan: (prepared) =>
      createExecutionPlan({
        summary: `Borrow ${prepared.amount} ${prepared.token} from Aave V3`,
        group: "lend",
        protocol: "aave",
        command: "borrow",
        chain: prepared.chain,
        accountType: "evm",
        steps: [
          createTransactionStep("Submit borrow transaction", {
            token: prepared.token,
            amount: prepared.amount,
            method: "borrow",
            interestRateMode: "variable",
          }),
        ],
        warnings: [
          "Borrowing requires sufficient collateral and a healthy Aave account.",
        ],
        metadata: {
          displayName: "Aave V3",
          token: prepared.token,
          amount: prepared.amount,
          interestRateMode: "variable",
        },
      }),
    resolveAuth: async () => await getActivePrivateKey("evm"),
    execute: async (prepared, privateKey) => {
      const client = new AaveClient(prepared.chain, privateKey);
      return await client.borrow(prepared.token, prepared.amount);
    },
  };
}
