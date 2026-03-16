import {
  createExecutionPlan,
  createTransactionStep,
  type ExecutionPlan,
} from "../../core/execution-plan";

interface HyperliquidExecutionPlanOptions {
  amount: string;
  estimatedPrice: number;
  leverage: number;
  side: "long" | "short";
  sizeUsd: number;
  symbol: string;
}

export function createHyperliquidExecutionPlan(
  options: HyperliquidExecutionPlanOptions,
): ExecutionPlan {
  return createExecutionPlan({
    summary: `Open ${options.side} ${options.symbol} on Hyperliquid with $${options.sizeUsd} at ${options.leverage}x`,
    group: "perps",
    protocol: "hyperliquid",
    command: options.side,
    chain: "hyperliquid",
    accountType: "evm",
    steps: [
      createTransactionStep("Set market leverage", {
        symbol: options.symbol,
        leverage: `${options.leverage}x`,
      }),
      createTransactionStep(
        options.side === "long"
          ? "Submit market long order"
          : "Submit market short order",
        {
          symbol: options.symbol,
          side: options.side === "long" ? "buy" : "sell",
          sizeUsd: options.sizeUsd,
          amount: options.amount,
          estimatedPrice: options.estimatedPrice,
        },
      ),
    ],
    warnings: [
      "Perpetual positions can be liquidated if margin becomes insufficient.",
    ],
    metadata: {
      symbol: options.symbol,
      sizeUsd: options.sizeUsd,
      amount: options.amount,
      estimatedPrice: options.estimatedPrice,
      leverage: options.leverage,
    },
  });
}
