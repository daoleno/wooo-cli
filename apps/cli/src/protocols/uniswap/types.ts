import type { Address } from "viem";

export interface UniswapQuote {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  price: number;
  priceImpact: number;
  route: string;
}

export interface UniswapSwapResult {
  txHash: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  status: string;
}

export interface TokenInfo {
  symbol: string;
  address: Address;
  decimals: number;
}
