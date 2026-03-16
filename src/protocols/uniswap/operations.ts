import { getActivePrivateKey } from "../../core/context";
import {
  createApprovalStep,
  createExecutionPlan,
  createTransactionStep,
  createWrapStep,
  type ExecutionPlanStep,
} from "../../core/execution-plan";
import type { WriteOperation } from "../../core/write-operation";
import { UniswapClient } from "./client";
import { NATIVE_WRAPS } from "./constants";
import type { UniswapQuote, UniswapSwapResult } from "./types";

export interface UniswapSwapParams {
  amount: number;
  chain: string;
  tokenIn: string;
  tokenOut: string;
}

export interface PreparedUniswapSwap extends UniswapSwapParams {
  quote: UniswapQuote;
}

function isNativeToken(symbol: string): boolean {
  return symbol.toUpperCase() in NATIVE_WRAPS;
}

export function createUniswapSwapOperation(
  params: UniswapSwapParams,
): WriteOperation<PreparedUniswapSwap, string, UniswapSwapResult> {
  return {
    protocol: "uniswap",
    prepare: async () => {
      const client = new UniswapClient(params.chain);
      const quote = await client.quote(
        params.tokenIn,
        params.tokenOut,
        params.amount,
      );
      return { ...params, quote };
    },
    createPreview: (prepared) => ({
      action: `Swap ${prepared.amount} ${prepared.tokenIn} -> ${prepared.quote.amountOut} ${prepared.tokenOut} on Uniswap (${prepared.chain})`,
      details: {
        ...prepared.quote,
        chain: prepared.chain,
        protocol: "Uniswap V3",
      },
    }),
    createPlan: (prepared) => {
      const steps: ExecutionPlanStep[] = [];

      if (isNativeToken(prepared.tokenIn)) {
        steps.push(
          createWrapStep("Wrap native input token", {
            from: prepared.tokenIn,
            to: `Wrapped ${prepared.tokenIn}`,
            amount: prepared.amount,
          }),
        );
      } else {
        steps.push(
          createApprovalStep("Approve router spend", {
            token: prepared.tokenIn,
            amount: prepared.amount,
            spender: "Uniswap V3 Router",
          }),
        );
      }

      steps.push(
        createTransactionStep("Submit swap transaction", {
          tokenIn: prepared.tokenIn,
          tokenOut: prepared.tokenOut,
          amountIn: prepared.amount,
          amountOut: prepared.quote.amountOut,
          route: prepared.quote.route,
        }),
      );

      if (isNativeToken(prepared.tokenOut)) {
        steps.push(
          createTransactionStep("Unwrap native output token", {
            token: prepared.tokenOut,
          }),
        );
      }

      return createExecutionPlan({
        summary: `Swap ${prepared.amount} ${prepared.tokenIn} to ${prepared.quote.amountOut} ${prepared.tokenOut} via Uniswap`,
        group: "dex",
        protocol: "uniswap",
        command: "swap",
        chain: prepared.chain,
        accountType: "evm",
        steps,
        metadata: {
          quote: prepared.quote,
        },
      });
    },
    resolveAuth: async () => await getActivePrivateKey("evm"),
    execute: async (prepared, privateKey) => {
      const client = new UniswapClient(prepared.chain, privateKey);
      return await client.swap(
        prepared.tokenIn,
        prepared.tokenOut,
        prepared.amount,
      );
    },
  };
}
