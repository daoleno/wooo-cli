import { encodeFunctionData } from "viem";
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
import { LifiClient } from "./client";
import type { LifiBridgeResult, LifiQuote } from "./types";

export interface LifiBridgeParams {
  fromChain: string;
  toChain: string;
  fromToken: string;
  toToken: string;
  amount: number;
}

export interface PreparedLifiBridge extends LifiBridgeParams {
  quote: LifiQuote;
  fromAddress: string;
  fromChainId: string; // CAIP-2
}

const ERC20_APPROVE_ABI = [
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

/** Extract numeric EVM chain ID from CAIP-2 string (e.g. "eip155:1" → 1) */
export function getEvmChainNumber(chainName: string): number {
  const caip2 = resolveChainId(chainName);
  return Number.parseInt(caip2.split(":")[1], 10);
}

export function createLifiBridgeOperation(
  params: LifiBridgeParams,
): WriteOperation<PreparedLifiBridge, WalletPort, LifiBridgeResult> {
  return {
    protocol: "lifi",
    prepare: async () => {
      const wallet = await getActiveWallet("evm");
      const client = new LifiClient();
      const fromChainNum = getEvmChainNumber(params.fromChain);
      const toChainNum = getEvmChainNumber(params.toChain);
      const fromChainId = resolveChainId(params.fromChain);
      const fromToken = await client.resolveToken(
        params.fromChain,
        fromChainNum,
        params.fromToken,
      );
      const toToken = await client.resolveToken(
        params.toChain,
        toChainNum,
        params.toToken,
      );
      const quote = await client.getQuote({
        fromChain: fromChainNum,
        toChain: toChainNum,
        fromToken: fromToken.address,
        toToken: toToken.address,
        fromAmount: toBaseUnits(params.amount, fromToken.decimals),
        fromAddress: wallet.address,
      });
      return { ...params, quote, fromAddress: wallet.address, fromChainId };
    },
    createPreview: (prepared) => ({
      action: `Bridge ${prepared.amount} ${prepared.fromToken} from ${prepared.fromChain} to ${prepared.toChain} via LI.FI (${prepared.quote.bridgeName})`,
      details: {
        from: `${prepared.fromToken} on ${prepared.fromChain}`,
        to: `${prepared.toToken} on ${prepared.toChain}`,
        estimatedOutput: prepared.quote.toAmount,
        fees: `$${prepared.quote.fees.total} (gas: $${prepared.quote.fees.gas}, bridge: $${prepared.quote.fees.bridge})`,
        estimatedTime: `${prepared.quote.estimatedTime}s`,
        bridge: prepared.quote.bridgeName,
      },
    }),
    createPlan: (prepared) => {
      const steps: ExecutionPlanStep[] = [];

      if (prepared.quote.approvalAddress) {
        steps.push(
          createApprovalStep("Approve bridge contract", {
            token: prepared.fromToken,
            amount: prepared.amount,
            spender: prepared.quote.approvalAddress,
          }),
        );
      }

      steps.push(
        createTransactionStep("Submit bridge transaction", {
          from: `${prepared.fromToken} on ${prepared.fromChain}`,
          to: `${prepared.toToken} on ${prepared.toChain}`,
          bridge: prepared.quote.bridgeName,
          estimatedOutput: prepared.quote.toAmount,
        }),
      );

      return createExecutionPlan({
        summary: `Bridge ${prepared.amount} ${prepared.fromToken} from ${prepared.fromChain} to ${prepared.toChain} via LI.FI`,
        group: "bridge",
        protocol: "lifi",
        command: "bridge",
        chain: prepared.fromChain,
        accountType: "evm",
        steps,
        metadata: {
          destinationChain: prepared.toChain,
          estimatedTime: prepared.quote.estimatedTime,
          bridgeName: prepared.quote.bridgeName,
        },
      });
    },
    resolveAuth: async () => await getActiveWalletPort("evm"),
    execute: async (prepared, signer) => {
      let approvalTxHash: string | undefined;
      if (prepared.quote.approvalAddress) {
        approvalTxHash = String(
          await signer.signAndSendTransaction(prepared.fromChainId, {
            format: "evm-transaction",
            to: prepared.quote.fromTokenAddress as `0x${string}`,
            data: encodeFunctionData({
              abi: ERC20_APPROVE_ABI,
              functionName: "approve",
              args: [
                prepared.quote.approvalAddress as `0x${string}`,
                BigInt(prepared.quote.fromAmount),
              ],
            }),
            value: 0n,
          }),
        );
      }

      const txHash = await signer.signAndSendTransaction(prepared.fromChainId, {
        format: "evm-transaction",
        to: prepared.quote.transactionRequest.to as `0x${string}`,
        data: prepared.quote.transactionRequest.data as `0x${string}`,
        value: prepared.quote.transactionRequest.value
          ? BigInt(prepared.quote.transactionRequest.value)
          : undefined,
      });
      return {
        approvalTxHash,
        txHash: String(txHash),
        fromChain: prepared.fromChain,
        toChain: prepared.toChain,
        fromToken: prepared.fromToken,
        toToken: prepared.toToken,
        fromAmount: String(prepared.amount),
        estimatedToAmount: prepared.quote.toAmount,
      };
    },
  };
}
