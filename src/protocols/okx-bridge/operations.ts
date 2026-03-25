import { resolveChainId } from "../../core/chain-ids";
import { getActiveWallet, getActiveWalletPort } from "../../core/context";
import {
  createApprovalStep,
  createExecutionPlan,
  createTransactionStep,
  type ExecutionPlanStep,
} from "../../core/execution-plan";
import type { WalletPort } from "../../core/signers";
import type { WriteOperation } from "../../core/write-operation";
import { toBaseUnits } from "../bridge/token-resolution";
import { OkxBridgeClient } from "./client";
import type { OkxBridgeQuote, OkxBridgeResult } from "./types";

export interface OkxBridgeParams {
  fromChain: string;
  toChain: string;
  fromToken: string;
  toToken: string;
  amount: number;
}

export interface PreparedOkxBridge extends OkxBridgeParams {
  quote: OkxBridgeQuote;
  fromAddress: string;
  fromChainId: string; // CAIP-2
  approveData?: { to: string; data: string };
}

/** Extract numeric chain ID string for OKX API from chain name */
export function getOkxChainId(chainName: string): string {
  const caip2 = resolveChainId(chainName);
  return caip2.split(":")[1];
}

export function createOkxBridgeOperation(
  params: OkxBridgeParams,
): WriteOperation<PreparedOkxBridge, WalletPort, OkxBridgeResult> {
  return {
    protocol: "okx",
    prepare: async () => {
      const wallet = await getActiveWallet("evm");
      const client = new OkxBridgeClient();
      const fromChainOkxId = getOkxChainId(params.fromChain);
      const toChainOkxId = getOkxChainId(params.toChain);
      const fromChainId = resolveChainId(params.fromChain);
      const fromToken = await client.resolveToken(
        params.fromChain,
        fromChainOkxId,
        params.fromToken,
      );
      const toToken = await client.resolveToken(
        params.toChain,
        toChainOkxId,
        params.toToken,
      );

      const quote = await client.getQuote({
        fromChainId: fromChainOkxId,
        toChainId: toChainOkxId,
        fromTokenAddress: fromToken.address,
        toTokenAddress: toToken.address,
        amount: toBaseUnits(params.amount, fromToken.decimals),
        userWalletAddress: wallet.address,
      });

      let approveData: { to: string; data: string } | undefined;
      if (quote.needApproval && quote.approveTo) {
        approveData = await client.getApproveData({
          chainId: fromChainOkxId,
          tokenAddress: quote.fromToken.address,
          amount: quote.fromAmount,
          approveAddress: quote.approveTo,
        });
      }

      return {
        ...params,
        quote,
        fromAddress: wallet.address,
        fromChainId,
        approveData,
      };
    },
    createPreview: (prepared) => ({
      action: `Bridge ${prepared.amount} ${prepared.fromToken} from ${prepared.fromChain} to ${prepared.toChain} via OKX (${prepared.quote.bridgeName})`,
      details: {
        from: `${prepared.quote.fromToken.symbol} on ${prepared.fromChain}`,
        to: `${prepared.quote.toToken.symbol} on ${prepared.toChain}`,
        estimatedOutput: prepared.quote.toAmount,
        estimatedGas: prepared.quote.estimatedGas,
        bridge: prepared.quote.bridgeName,
      },
    }),
    createPlan: (prepared) => {
      const steps: ExecutionPlanStep[] = [];

      if (prepared.approveData) {
        steps.push(
          createApprovalStep("Approve bridge contract", {
            token: prepared.quote.fromToken.symbol,
            amount: prepared.amount,
            spender: prepared.quote.approveTo ?? "OKX Bridge",
          }),
        );
      }

      steps.push(
        createTransactionStep("Submit bridge transaction", {
          from: `${prepared.quote.fromToken.symbol} on ${prepared.fromChain}`,
          to: `${prepared.quote.toToken.symbol} on ${prepared.toChain}`,
          bridge: prepared.quote.bridgeName,
          estimatedOutput: prepared.quote.toAmount,
        }),
      );

      return createExecutionPlan({
        summary: `Bridge ${prepared.amount} ${prepared.fromToken} from ${prepared.fromChain} to ${prepared.toChain} via OKX`,
        group: "bridge",
        protocol: "okx",
        command: "bridge",
        chain: prepared.fromChain,
        accountType: "evm",
        steps,
        metadata: {
          destinationChain: prepared.toChain,
          bridgeName: prepared.quote.bridgeName,
        },
      });
    },
    resolveAuth: async () => await getActiveWalletPort("evm"),
    execute: async (prepared, signer) => {
      let approvalTxHash: string | undefined;
      if (prepared.approveData) {
        approvalTxHash = String(
          await signer.signAndSendTransaction(prepared.fromChainId, {
            format: "evm-transaction",
            to: prepared.approveData.to as `0x${string}`,
            data: prepared.approveData.data as `0x${string}`,
            value: 0n,
          }),
        );
      }

      const txHash = await signer.signAndSendTransaction(prepared.fromChainId, {
        format: "evm-transaction",
        to: prepared.quote.tx.to as `0x${string}`,
        data: prepared.quote.tx.data as `0x${string}`,
        value: prepared.quote.tx.value
          ? BigInt(prepared.quote.tx.value)
          : undefined,
      });
      return {
        approvalTxHash,
        txHash: String(txHash),
        fromChainId: prepared.quote.fromChainId,
        toChainId: prepared.quote.toChainId,
        fromToken: prepared.quote.fromToken.symbol,
        toToken: prepared.quote.toToken.symbol,
        fromAmount: String(prepared.amount),
        estimatedToAmount: prepared.quote.toAmount,
      };
    },
  };
}
