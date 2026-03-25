import { getActiveWalletPort } from "../../core/context";
import {
  createExecutionPlan,
  createTransactionStep,
} from "../../core/execution-plan";
import type { WalletPort } from "../../core/signers";
import type { WriteOperation } from "../../core/write-operation";
import { createDefaultJupiterClient } from "./runtime";
import type {
  JupiterQuote,
  JupiterQuoteResponseData,
  JupiterSwapResult,
} from "./types";

export interface JupiterSwapParams {
  amount: number;
  tokenIn: string;
  tokenOut: string;
}

export interface PreparedJupiterSwap extends JupiterSwapParams {
  quote: JupiterQuote;
  quoteResponse: JupiterQuoteResponseData;
}

export function createJupiterSwapOperation(
  params: JupiterSwapParams,
): WriteOperation<PreparedJupiterSwap, WalletPort, JupiterSwapResult> {
  return {
    protocol: "jupiter",
    prepare: async () => {
      const client = createDefaultJupiterClient();
      const preparedQuote = await client.prepareQuote(
        params.tokenIn,
        params.tokenOut,
        params.amount,
      );
      return {
        ...params,
        quote: preparedQuote.quote,
        quoteResponse: preparedQuote.response,
      };
    },
    createPreview: (prepared) => ({
      action: `Swap ${prepared.amount} ${prepared.tokenIn} -> ${prepared.quote.outAmount} ${prepared.tokenOut} via Jupiter (Solana)`,
      details: {
        tokenIn: prepared.tokenIn,
        tokenOut: prepared.tokenOut,
        amountIn: prepared.amount,
        amountOut: prepared.quote.outAmount,
        priceImpact: prepared.quote.priceImpact,
        chain: "solana",
        protocol: "Jupiter",
      },
    }),
    createPlan: (prepared) =>
      createExecutionPlan({
        summary: `Swap ${prepared.amount} ${prepared.tokenIn} to ${prepared.quote.outAmount} ${prepared.tokenOut} via Jupiter`,
        group: "dex",
        protocol: "jupiter",
        command: "swap",
        chain: "solana",
        accountType: "solana",
        steps: [
          createTransactionStep("Submit Jupiter swap transaction", {
            tokenIn: prepared.tokenIn,
            tokenOut: prepared.tokenOut,
            amountIn: prepared.amount,
            amountOut: prepared.quote.outAmount,
            priceImpact: prepared.quote.priceImpact,
            route: prepared.quote.routePlan,
          }),
        ],
        metadata: {
          quote: prepared.quote,
        },
      }),
    resolveAuth: async () => await getActiveWalletPort("solana"),
    execute: async (prepared, signer) => {
      const client = createDefaultJupiterClient(signer);
      return await client.swap(
        prepared.tokenIn,
        prepared.tokenOut,
        prepared.amount,
        prepared.quoteResponse,
      );
    },
  };
}
