import { getActivePrivateKey, getActiveWallet } from "../../core/context";
import {
  createApprovalStep,
  createExecutionPlan,
  createTransactionStep,
} from "../../core/execution-plan";
import type { WriteOperation } from "../../core/write-operation";
import { MorphoClient } from "./client";
import type { MorphoPreparedWrite, MorphoWriteResult } from "./types";

export interface MorphoAmountWriteParams {
  chain: string;
  marketId: string;
  amount: number;
}

export interface MorphoAllModeWriteParams {
  chain: string;
  marketId: string;
  amount?: number;
  all?: boolean;
}

function getActionLabel(prepared: MorphoPreparedWrite): string {
  switch (prepared.command) {
    case "supply":
      return "Supply";
    case "withdraw":
      return "Withdraw";
    case "borrow":
      return "Borrow";
    case "repay":
      return "Repay";
    case "supply-collateral":
      return "Supply collateral";
    case "withdraw-collateral":
      return "Withdraw collateral";
    default: {
      const exhaustive: never = prepared.command;
      return exhaustive;
    }
  }
}

function getWarnings(prepared: MorphoPreparedWrite): string[] {
  const warnings: string[] = [];

  if (prepared.command === "borrow") {
    warnings.push(
      "Borrowing requires sufficient collateral and a healthy Morpho position.",
    );
  }

  if (prepared.command === "withdraw") {
    warnings.push(
      "Withdrawals are limited by your supplied shares and market liquidity.",
    );
  }

  if (prepared.command === "withdraw-collateral") {
    warnings.push(
      "Withdrawing collateral can reduce health factor and may revert if the position becomes unsafe.",
    );
  }

  if (prepared.all && prepared.mode === "shares") {
    warnings.push(
      "This plan uses shares to close the full position and avoid leftover dust.",
    );
  }

  return warnings;
}

function createMorphoPlan(prepared: MorphoPreparedWrite) {
  const action = getActionLabel(prepared);
  const steps = [];

  if (prepared.requiresApproval) {
    steps.push(
      createApprovalStep("Approve Morpho Blue spend", {
        token: prepared.token,
        amount: prepared.amountDisplay,
        spender: "Morpho Blue",
      }),
    );
  }

  steps.push(
    createTransactionStep(`Submit Morpho ${prepared.command} transaction`, {
      market: prepared.marketLabel,
      marketId: prepared.marketId,
      token: prepared.token,
      amount: prepared.amountDisplay,
      mode: prepared.mode,
      shares: prepared.sharesDisplay,
    }),
  );

  return createExecutionPlan({
    summary: `${action} ${prepared.amountDisplay} on Morpho market ${prepared.marketLabel}`,
    group: "lend",
    protocol: "morpho",
    command: prepared.command,
    chain: prepared.chain,
    accountType: "evm",
    steps,
    warnings: getWarnings(prepared),
    metadata: {
      displayName: "Morpho Markets V1",
      marketId: prepared.marketId,
      market: prepared.marketLabel,
      token: prepared.token,
      amount: prepared.amountDisplay,
      all: prepared.all,
      mode: prepared.mode,
      shares: prepared.sharesDisplay,
      assetType: prepared.assetType,
    },
  });
}

function createMorphoOperation(
  prepare: () => Promise<MorphoPreparedWrite>,
): WriteOperation<MorphoPreparedWrite, string, MorphoWriteResult> {
  return {
    protocol: "morpho",
    prepare,
    createPreview: (prepared) => {
      const action = getActionLabel(prepared);
      return {
        action: `${action} ${prepared.amountDisplay} on Morpho market ${prepared.marketLabel} (${prepared.chain})`,
        details: {
          market: prepared.marketLabel,
          marketId: prepared.marketId,
          token: prepared.token,
          amount: prepared.amountDisplay,
          mode: prepared.mode,
          shares: prepared.sharesDisplay ?? "N/A",
          chain: prepared.chain,
          protocol: "Morpho Markets V1",
        },
      };
    },
    createPlan: createMorphoPlan,
    resolveAuth: async () => await getActivePrivateKey("evm"),
    execute: async (prepared, privateKey) => {
      const client = new MorphoClient(prepared.chain, privateKey);
      return await client.executeWrite(prepared);
    },
  };
}

export function createMorphoSupplyOperation(
  params: MorphoAmountWriteParams,
): WriteOperation<MorphoPreparedWrite, string, MorphoWriteResult> {
  return createMorphoOperation(async () => {
    const client = new MorphoClient(params.chain);
    return await client.prepareSupply(params.marketId, params.amount);
  });
}

export function createMorphoWithdrawOperation(
  params: MorphoAllModeWriteParams,
): WriteOperation<MorphoPreparedWrite, string, MorphoWriteResult> {
  return createMorphoOperation(async () => {
    const client = new MorphoClient(params.chain);
    const wallet = params.all ? await getActiveWallet("evm") : undefined;
    return await client.prepareWithdraw(
      params.marketId,
      params.amount,
      wallet?.address,
    );
  });
}

export function createMorphoBorrowOperation(
  params: MorphoAmountWriteParams,
): WriteOperation<MorphoPreparedWrite, string, MorphoWriteResult> {
  return createMorphoOperation(async () => {
    const client = new MorphoClient(params.chain);
    return await client.prepareBorrow(params.marketId, params.amount);
  });
}

export function createMorphoRepayOperation(
  params: MorphoAllModeWriteParams,
): WriteOperation<MorphoPreparedWrite, string, MorphoWriteResult> {
  return createMorphoOperation(async () => {
    const client = new MorphoClient(params.chain);
    const wallet = params.all ? await getActiveWallet("evm") : undefined;
    return await client.prepareRepay(
      params.marketId,
      params.amount,
      wallet?.address,
    );
  });
}

export function createMorphoSupplyCollateralOperation(
  params: MorphoAmountWriteParams,
): WriteOperation<MorphoPreparedWrite, string, MorphoWriteResult> {
  return createMorphoOperation(async () => {
    const client = new MorphoClient(params.chain);
    return await client.prepareSupplyCollateral(params.marketId, params.amount);
  });
}

export function createMorphoWithdrawCollateralOperation(
  params: MorphoAllModeWriteParams,
): WriteOperation<MorphoPreparedWrite, string, MorphoWriteResult> {
  return createMorphoOperation(async () => {
    const client = new MorphoClient(params.chain);
    const wallet = params.all ? await getActiveWallet("evm") : undefined;
    return await client.prepareWithdrawCollateral(
      params.marketId,
      params.amount,
      wallet?.address,
    );
  });
}
