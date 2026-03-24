import { getActiveSigner } from "../../core/context";
import {
  createApprovalStep,
  createExecutionPlan,
  createTransactionStep,
} from "../../core/execution-plan";
import type { WoooSigner } from "../../core/signers";
import type { WriteOperation } from "../../core/write-operation";
import { NATIVE_WRAPS } from "../uniswap/constants";
import { CurveClient } from "./client";
import type { CurveQuote, CurveSwapResult } from "./types";

export interface CurveSwapParams {
  amount: number;
  chain: string;
  tokenIn: string;
  tokenOut: string;
}

export interface PreparedCurveSwap extends CurveSwapParams {
  quote: CurveQuote;
}

function isNativeToken(symbol: string): boolean {
  return symbol.toUpperCase() in NATIVE_WRAPS;
}

export function createCurveSwapOperation(
  params: CurveSwapParams,
): WriteOperation<PreparedCurveSwap, WoooSigner, CurveSwapResult> {
  return {
    protocol: "curve",
    prepare: async () => {
      const client = new CurveClient(params.chain);
      const quote = await client.quote(
        params.tokenIn,
        params.tokenOut,
        params.amount,
      );
      return { ...params, quote };
    },
    createPreview: (prepared) => ({
      action: `Swap ${prepared.amount} ${prepared.tokenIn} -> ${prepared.quote.amountOut} ${prepared.tokenOut} via Curve (${prepared.chain})`,
      details: {
        tokenIn: prepared.tokenIn,
        tokenOut: prepared.tokenOut,
        amountIn: prepared.amount,
        amountOut: prepared.quote.amountOut,
        pool: prepared.quote.pool,
        chain: prepared.chain,
        protocol: "Curve",
      },
    }),
    createPlan: (prepared) =>
      createExecutionPlan({
        summary: `Swap ${prepared.amount} ${prepared.tokenIn} to ${prepared.quote.amountOut} ${prepared.tokenOut} via Curve`,
        group: "dex",
        protocol: "curve",
        command: "swap",
        chain: prepared.chain,
        accountType: "evm",
        steps: isNativeToken(prepared.tokenIn)
          ? [
              createTransactionStep("Submit Curve router swap", {
                tokenIn: prepared.tokenIn,
                tokenOut: prepared.tokenOut,
                amountIn: prepared.amount,
                amountOut: prepared.quote.amountOut,
                route: prepared.quote.pool,
              }),
            ]
          : [
              createApprovalStep("Approve router spend", {
                token: prepared.tokenIn,
                amount: prepared.amount,
                spender: "Curve Router",
              }),
              createTransactionStep("Submit Curve router swap", {
                tokenIn: prepared.tokenIn,
                tokenOut: prepared.tokenOut,
                amountIn: prepared.amount,
                amountOut: prepared.quote.amountOut,
                route: prepared.quote.pool,
              }),
            ],
        warnings: [
          "Curve routing may span multiple pools depending on market conditions.",
        ],
        metadata: {
          quote: prepared.quote,
        },
      }),
    resolveAuth: async () => await getActiveSigner("evm"),
    execute: async (prepared, signer) => {
      const client = new CurveClient(prepared.chain, signer);
      return await client.swap(
        prepared.tokenIn,
        prepared.tokenOut,
        prepared.amount,
      );
    },
  };
}
