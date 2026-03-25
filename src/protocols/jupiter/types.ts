export interface JupiterQuoteRouteStep {
  swapInfo?: {
    label?: string;
  };
}

export interface JupiterQuoteResponseData {
  outAmount: string;
  priceImpactPct?: string;
  routePlan?: JupiterQuoteRouteStep[];
}

export interface JupiterQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpact: string;
  routePlan: string;
}

export interface JupiterSwapResult {
  txHash: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  status: string;
}
