export interface CurveSwapResult {
  txHash: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  pool: string;
  status: string;
}

export interface CurvePool {
  name: string;
  address: string;
  tokens: string[];
  tvl?: string;
}
