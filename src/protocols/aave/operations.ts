import { getActiveEvmSigner } from "../../core/context";
import {
  createApprovalStep,
  createExecutionPlan,
  createTransactionStep,
} from "../../core/execution-plan";
import type { EvmSigner } from "../../core/signers";
import type { WriteOperation } from "../../core/write-operation";
import { AaveClient } from "./client";
import type {
  AaveBorrowResult,
  AaveRepayResult,
  AaveSupplyResult,
  AaveWithdrawResult,
} from "./types";

export interface AaveSupplyParams {
  amount: number;
  chain: string;
  market?: string;
  token: string;
}

export interface AaveBorrowParams {
  amount: number;
  chain: string;
  market?: string;
  token: string;
}

export interface AaveWithdrawParams {
  amount?: number;
  all?: boolean;
  chain: string;
  market?: string;
  token: string;
}

export interface AaveRepayParams {
  amount?: number;
  all?: boolean;
  chain: string;
  market?: string;
  token: string;
}

export interface PreparedAaveSupply extends AaveSupplyParams {
  market: string;
  marketAddress: string;
}

export interface PreparedAaveBorrow extends AaveBorrowParams {
  market: string;
  marketAddress: string;
}

export interface PreparedAaveWithdraw extends Required<AaveWithdrawParams> {
  market: string;
  marketAddress: string;
}

export interface PreparedAaveRepay extends Required<AaveRepayParams> {
  market: string;
  marketAddress: string;
}

export function createAaveSupplyOperation(
  params: AaveSupplyParams,
): WriteOperation<PreparedAaveSupply, EvmSigner, AaveSupplyResult> {
  return {
    protocol: "aave",
    prepare: async () => {
      const client = new AaveClient(params.chain);
      const selection = await client.resolveReserveSelection(
        params.token,
        params.market,
      );
      return {
        ...params,
        market: selection.market,
        marketAddress: selection.marketAddress,
      };
    },
    createPreview: (prepared) => ({
      action: `Supply ${prepared.amount} ${prepared.token} to ${prepared.market}`,
      details: {
        token: prepared.token,
        amount: prepared.amount,
        chain: prepared.chain,
        protocol: "Aave V3",
        market: prepared.market,
        marketAddress: prepared.marketAddress,
      },
    }),
    createPlan: (prepared) =>
      createExecutionPlan({
        summary: `Supply ${prepared.amount} ${prepared.token} to ${prepared.market}`,
        group: "lend",
        protocol: "aave",
        command: "supply",
        chain: prepared.chain,
        accountType: "evm",
        steps: [
          createApprovalStep("Approve token spend", {
            token: prepared.token,
            amount: prepared.amount,
            spender: prepared.marketAddress,
          }),
          createTransactionStep("Submit supply transaction", {
            token: prepared.token,
            amount: prepared.amount,
            method: "supply",
          }),
        ],
        metadata: {
          displayName: "Aave V3",
          market: prepared.market,
          marketAddress: prepared.marketAddress,
          token: prepared.token,
          amount: prepared.amount,
        },
      }),
    resolveAuth: async () => await getActiveEvmSigner(),
    execute: async (prepared, signer) => {
      const client = new AaveClient(prepared.chain, signer);
      return await client.supply(
        prepared.token,
        prepared.amount,
        prepared.marketAddress,
      );
    },
  };
}

export function createAaveBorrowOperation(
  params: AaveBorrowParams,
): WriteOperation<PreparedAaveBorrow, EvmSigner, AaveBorrowResult> {
  return {
    protocol: "aave",
    prepare: async () => {
      const client = new AaveClient(params.chain);
      const selection = await client.resolveReserveSelection(
        params.token,
        params.market,
      );
      return {
        ...params,
        market: selection.market,
        marketAddress: selection.marketAddress,
      };
    },
    createPreview: (prepared) => ({
      action: `Borrow ${prepared.amount} ${prepared.token} from ${prepared.market}`,
      details: {
        token: prepared.token,
        amount: prepared.amount,
        chain: prepared.chain,
        protocol: "Aave V3",
        market: prepared.market,
        marketAddress: prepared.marketAddress,
        rateMode: "variable",
      },
    }),
    createPlan: (prepared) =>
      createExecutionPlan({
        summary: `Borrow ${prepared.amount} ${prepared.token} from ${prepared.market}`,
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
          market: prepared.market,
          marketAddress: prepared.marketAddress,
          token: prepared.token,
          amount: prepared.amount,
          interestRateMode: "variable",
        },
      }),
    resolveAuth: async () => await getActiveEvmSigner(),
    execute: async (prepared, signer) => {
      const client = new AaveClient(prepared.chain, signer);
      return await client.borrow(
        prepared.token,
        prepared.amount,
        prepared.marketAddress,
      );
    },
  };
}

export function createAaveWithdrawOperation(
  params: AaveWithdrawParams,
): WriteOperation<PreparedAaveWithdraw, EvmSigner, AaveWithdrawResult> {
  return {
    protocol: "aave",
    prepare: async () => {
      const client = new AaveClient(params.chain);
      const selection = await client.resolveReserveSelection(
        params.token,
        params.market,
      );
      return {
        amount: params.amount ?? 0,
        all: params.all ?? false,
        chain: params.chain,
        market: selection.market,
        marketAddress: selection.marketAddress,
        token: params.token,
      };
    },
    createPreview: (prepared) => ({
      action: `Withdraw ${prepared.all ? "all" : prepared.amount} ${prepared.token} from ${prepared.market}`,
      details: {
        token: prepared.token,
        amount: prepared.all ? "ALL" : prepared.amount,
        chain: prepared.chain,
        protocol: "Aave V3",
        market: prepared.market,
        marketAddress: prepared.marketAddress,
      },
    }),
    createPlan: (prepared) =>
      createExecutionPlan({
        summary: `Withdraw ${prepared.all ? "all" : prepared.amount} ${prepared.token} from ${prepared.market}`,
        group: "lend",
        protocol: "aave",
        command: "withdraw",
        chain: prepared.chain,
        accountType: "evm",
        steps: [
          createTransactionStep("Submit withdraw transaction", {
            token: prepared.token,
            amount: prepared.all ? "ALL" : prepared.amount,
            method: "withdraw",
          }),
        ],
        warnings: [
          "Withdrawals are limited by supplied balance and current Aave liquidity.",
        ],
        metadata: {
          displayName: "Aave V3",
          market: prepared.market,
          marketAddress: prepared.marketAddress,
          token: prepared.token,
          amount: prepared.all ? "ALL" : prepared.amount,
          all: prepared.all,
        },
      }),
    resolveAuth: async () => await getActiveEvmSigner(),
    execute: async (prepared, signer) => {
      const client = new AaveClient(prepared.chain, signer);
      return await client.withdraw(
        prepared.token,
        prepared.all ? undefined : prepared.amount,
        prepared.all,
        prepared.marketAddress,
      );
    },
  };
}

export function createAaveRepayOperation(
  params: AaveRepayParams,
): WriteOperation<PreparedAaveRepay, EvmSigner, AaveRepayResult> {
  return {
    protocol: "aave",
    prepare: async () => {
      const client = new AaveClient(params.chain);
      const selection = await client.resolveReserveSelection(
        params.token,
        params.market,
      );
      return {
        amount: params.amount ?? 0,
        all: params.all ?? false,
        chain: params.chain,
        market: selection.market,
        marketAddress: selection.marketAddress,
        token: params.token,
      };
    },
    createPreview: (prepared) => ({
      action: `Repay ${prepared.all ? "all" : prepared.amount} ${prepared.token} on ${prepared.market}`,
      details: {
        token: prepared.token,
        amount: prepared.all ? "ALL" : prepared.amount,
        chain: prepared.chain,
        protocol: "Aave V3",
        market: prepared.market,
        marketAddress: prepared.marketAddress,
        rateMode: "variable",
      },
    }),
    createPlan: (prepared) =>
      createExecutionPlan({
        summary: `Repay ${prepared.all ? "all" : prepared.amount} ${prepared.token} on ${prepared.market}`,
        group: "lend",
        protocol: "aave",
        command: "repay",
        chain: prepared.chain,
        accountType: "evm",
        steps: [
          createApprovalStep("Approve token spend", {
            token: prepared.token,
            amount: prepared.all ? "ALL" : prepared.amount,
            spender: prepared.marketAddress,
          }),
          createTransactionStep("Submit repay transaction", {
            token: prepared.token,
            amount: prepared.all ? "ALL" : prepared.amount,
            method: "repay",
            interestRateMode: "variable",
          }),
        ],
        warnings: [
          "This repays variable-rate debt only, matching the current Aave borrow flow.",
        ],
        metadata: {
          displayName: "Aave V3",
          market: prepared.market,
          marketAddress: prepared.marketAddress,
          token: prepared.token,
          amount: prepared.all ? "ALL" : prepared.amount,
          all: prepared.all,
          interestRateMode: "variable",
        },
      }),
    resolveAuth: async () => await getActiveEvmSigner(),
    execute: async (prepared, signer) => {
      const client = new AaveClient(prepared.chain, signer);
      return await client.repay(
        prepared.token,
        prepared.all ? undefined : prepared.amount,
        prepared.all,
        prepared.marketAddress,
      );
    },
  };
}
