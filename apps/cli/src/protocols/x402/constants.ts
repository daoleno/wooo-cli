import type { Address } from "viem";

export const DEFAULT_CHAIN = "base";

export const X402_VERSION = 1;

// USDC contract addresses per chain
export const USDC_ADDRESSES: Record<string, Address> = {
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  ethereum: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  polygon: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
};

// x402 network names (CAIP-2 style used by x402 SDK)
export const CHAIN_TO_X402_NETWORK: Record<string, string> = {
  base: "base",
  ethereum: "ethereum",
  polygon: "polygon",
  arbitrum: "arbitrum",
  avalanche: "avalanche",
};

export const USDC_DECIMALS = 6;

export const USDC_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;
