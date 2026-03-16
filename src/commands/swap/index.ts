import ansis from "ansis";
import { defineCommand } from "citty";
import { SWAP_CHAIN_HELP_TEXT_WITH_DEFAULT } from "../../core/chains";
import type { ExecutionPlan } from "../../core/execution-plan";
import {
  validateAmount,
  validateChain,
  validateTokenSymbol,
} from "../../core/validation";
import {
  runPreparedWriteOperation,
  type WriteOperation,
} from "../../core/write-operation";
import {
  createCurveSwapOperation,
  type PreparedCurveSwap,
} from "../../protocols/curve/operations";
import type { CurveSwapResult } from "../../protocols/curve/types";
import {
  createJupiterSwapOperation,
  type PreparedJupiterSwap,
} from "../../protocols/jupiter/operations";
import type { JupiterSwapResult } from "../../protocols/jupiter/types";
import {
  createUniswapSwapOperation,
  type PreparedUniswapSwap,
} from "../../protocols/uniswap/operations";
import type { UniswapSwapResult } from "../../protocols/uniswap/types";

const SUPPORTED_CHAINS = [
  "ethereum",
  "arbitrum",
  "optimism",
  "polygon",
  "base",
  "solana",
];

type SwapRouteProtocol = "curve" | "jupiter" | "uniswap";

export interface SwapQuote {
  protocol: SwapRouteProtocol;
  amountOut: string;
  price: number;
}

interface PreparedSwapRoute<
  TPrepared,
  TAuth,
  TResult,
  TProtocol extends SwapRouteProtocol,
> {
  operation: WriteOperation<TPrepared, TAuth, TResult>;
  prepared: TPrepared;
  protocol: TProtocol;
  quote: SwapQuote & { protocol: TProtocol };
}

type AnyPreparedSwapRoute =
  | PreparedSwapRoute<
      PreparedCurveSwap,
      ReturnType<typeof createCurveSwapOperation> extends WriteOperation<
        PreparedCurveSwap,
        infer TAuth,
        CurveSwapResult
      >
        ? TAuth
        : never,
      CurveSwapResult,
      "curve"
    >
  | PreparedSwapRoute<
      PreparedJupiterSwap,
      ReturnType<typeof createJupiterSwapOperation> extends WriteOperation<
        PreparedJupiterSwap,
        infer TAuth,
        JupiterSwapResult
      >
        ? TAuth
        : never,
      JupiterSwapResult,
      "jupiter"
    >
  | PreparedSwapRoute<
      PreparedUniswapSwap,
      ReturnType<typeof createUniswapSwapOperation> extends WriteOperation<
        PreparedUniswapSwap,
        infer TAuth,
        UniswapSwapResult
      >
        ? TAuth
        : never,
      UniswapSwapResult,
      "uniswap"
    >;

function quotePrice(amountIn: number, amountOut: string): number {
  const output = Number.parseFloat(amountOut);
  if (!Number.isFinite(output) || !Number.isFinite(amountIn) || amountIn <= 0) {
    return 0;
  }
  return output / amountIn;
}

function decorateAggregatedPlan(
  plan: ExecutionPlan,
  quotes: SwapQuote[],
  bestRoute: string,
): ExecutionPlan {
  return {
    ...plan,
    warnings: [
      ...plan.warnings,
      "This plan was selected by the aggregated swap router.",
    ],
    metadata: {
      ...(plan.metadata ?? {}),
      bestRoute,
      quotes,
    },
  };
}

async function prepareRoute<
  TPrepared,
  TAuth,
  TResult,
  TProtocol extends SwapRouteProtocol,
>(
  operation: WriteOperation<TPrepared, TAuth, TResult>,
  toQuote: (prepared: TPrepared) => SwapQuote & { protocol: TProtocol },
): Promise<PreparedSwapRoute<TPrepared, TAuth, TResult, TProtocol>> {
  const prepared = await operation.prepare();
  const quote = toQuote(prepared);
  return {
    operation,
    prepared,
    protocol: quote.protocol,
    quote,
  };
}

export function selectBestRoute(quotes: SwapQuote[]): SwapQuote {
  if (quotes.length === 0) {
    throw new Error("No swap quotes available");
  }

  return quotes.reduce((best, quote) =>
    Number.parseFloat(quote.amountOut) > Number.parseFloat(best.amountOut)
      ? quote
      : best,
  );
}

async function runSelectedRoute(
  args: {
    yes?: boolean;
    "dry-run"?: boolean;
    json?: boolean;
    format?: string;
  },
  route: AnyPreparedSwapRoute,
  quotes: SwapQuote[],
  bestRoute: string,
): Promise<void> {
  switch (route.protocol) {
    case "curve":
      await runPreparedWriteOperation(args, route.operation, route.prepared, {
        formatPlan: (plan) => decorateAggregatedPlan(plan, quotes, bestRoute),
        formatResult: (result) => ({
          ...(result as unknown as Record<string, unknown>),
          bestRoute,
        }),
      });
      return;
    case "jupiter":
      await runPreparedWriteOperation(args, route.operation, route.prepared, {
        formatPlan: (plan) => decorateAggregatedPlan(plan, quotes, bestRoute),
        formatResult: (result) => ({
          ...(result as unknown as Record<string, unknown>),
          bestRoute,
        }),
      });
      return;
    case "uniswap":
      await runPreparedWriteOperation(args, route.operation, route.prepared, {
        formatPlan: (plan) => decorateAggregatedPlan(plan, quotes, bestRoute),
        formatResult: (result) => ({
          ...(result as unknown as Record<string, unknown>),
          bestRoute,
        }),
      });
      return;
    default: {
      const exhaustive: never = route;
      return exhaustive;
    }
  }
}

export default defineCommand({
  meta: {
    name: "swap",
    description: "Aggregated swap — auto-selects best route across DEXes",
  },
  args: {
    tokenIn: {
      type: "positional",
      description: "Token to sell (e.g. USDC, ETH)",
      required: true,
    },
    tokenOut: {
      type: "positional",
      description: "Token to buy (e.g. DAI, USDT)",
      required: true,
    },
    amount: {
      type: "positional",
      description: "Amount of tokenIn to swap",
      required: true,
    },
    chain: {
      type: "string",
      description: SWAP_CHAIN_HELP_TEXT_WITH_DEFAULT,
      default: "ethereum",
    },
    yes: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const tokenIn = validateTokenSymbol(args.tokenIn, "Input token");
    const tokenOut = validateTokenSymbol(args.tokenOut, "Output token");
    const amount = validateAmount(args.amount);
    const chain = validateChain(args.chain, SUPPORTED_CHAINS);

    if (chain === "solana") {
      const route = await prepareRoute(
        createJupiterSwapOperation({
          tokenIn,
          tokenOut,
          amount,
        }),
        (prepared) => ({
          protocol: "jupiter",
          amountOut: prepared.quote.outAmount,
          price: quotePrice(prepared.amount, prepared.quote.outAmount),
        }),
      );

      await runPreparedWriteOperation(args, route.operation, route.prepared, {
        formatPlan: (plan) =>
          decorateAggregatedPlan(plan, [route.quote], route.quote.protocol),
        formatResult: (result) => ({
          ...(result as unknown as Record<string, unknown>),
          bestRoute: route.quote.protocol,
        }),
      });
      return;
    }

    const preparedRoutes: AnyPreparedSwapRoute[] = [];

    try {
      preparedRoutes.push(
        await prepareRoute(
          createUniswapSwapOperation({
            tokenIn,
            tokenOut,
            amount,
            chain,
          }),
          (prepared) => ({
            protocol: "uniswap",
            amountOut: prepared.quote.amountOut,
            price: prepared.quote.price,
          }),
        ),
      );
    } catch {
      // Uniswap does not support this route.
    }

    try {
      preparedRoutes.push(
        await prepareRoute(
          createCurveSwapOperation({
            tokenIn,
            tokenOut,
            amount,
            chain,
          }),
          (prepared) => ({
            protocol: "curve",
            amountOut: prepared.quote.amountOut,
            price: prepared.quote.price,
          }),
        ),
      );
    } catch {
      // Curve does not support this route.
    }

    if (preparedRoutes.length === 0) {
      console.error(
        `No DEX route found for ${tokenIn} -> ${tokenOut} on ${chain}`,
      );
      process.exit(1);
    }

    const quotes = preparedRoutes.map((route) => route.quote);
    const bestQuote = selectBestRoute(quotes);
    const selectedRoute = preparedRoutes.find(
      (route) => route.quote.protocol === bestQuote.protocol,
    );

    if (!selectedRoute) {
      console.error(`Selected route ${bestQuote.protocol} is unavailable.`);
      process.exit(1);
    }

    if (quotes.length > 1) {
      console.error(ansis.dim("Route comparison:"));
      for (const quote of quotes) {
        const marker =
          quote.protocol === bestQuote.protocol ? ansis.green("★") : " ";
        console.error(
          `  ${marker} ${quote.protocol.padEnd(10)} -> ${quote.amountOut} ${tokenOut}`,
        );
      }
    }

    await runSelectedRoute(args, selectedRoute, quotes, bestQuote.protocol);
  },
});
