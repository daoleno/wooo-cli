import type { Address } from "viem";

// Curve Router (supports multi-hop swaps across pools)
export const CURVE_ROUTER: Record<string, Address> = {
  ethereum: "0xF0d4c12A5768D806021F80a262B4d39d26C58b8D",
  arbitrum: "0xF0d4c12A5768D806021F80a262B4d39d26C58b8D",
  optimism: "0xF0d4c12A5768D806021F80a262B4d39d26C58b8D",
  polygon: "0xF0d4c12A5768D806021F80a262B4d39d26C58b8D",
  base: "0xd6681e74eEA20d196c824C7e6BC4b8a3e6e06F37",
};

// Well-known Curve pools (Ethereum mainnet)
export const CURVE_POOLS: Record<string, { address: Address; name: string; tokens: string[]; tokenAddresses: Address[]; decimals: number[] }> = {
  "3pool": {
    address: "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7",
    name: "3pool (DAI/USDC/USDT)",
    tokens: ["DAI", "USDC", "USDT"],
    tokenAddresses: [
      "0x6B175474E89094C44Da98b954EedeAC495271d0F", // DAI
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
      "0xdAC17F958D2ee523a2206206994597C13D831ec7", // USDT
    ],
    decimals: [18, 6, 6],
  },
  steth: {
    address: "0xDC24316b9AE028F1497c275EB9192a3Ea0f67022",
    name: "stETH (ETH/stETH)",
    tokens: ["ETH", "stETH"],
    tokenAddresses: [
      "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", // ETH
      "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84", // stETH
    ],
    decimals: [18, 18],
  },
  tricrypto2: {
    address: "0xD51a44d3FaE010294C616388b506AcdA1bfAAE46",
    name: "tricrypto2 (USDT/WBTC/WETH)",
    tokens: ["USDT", "WBTC", "WETH"],
    tokenAddresses: [
      "0xdAC17F958D2ee523a2206206994597C13D831ec7", // USDT
      "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", // WBTC
      "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
    ],
    decimals: [6, 8, 18],
  },
};

// Curve pool exchange ABI (StableSwap)
export const CURVE_POOL_ABI = [
  {
    name: "get_dy",
    outputs: [{ type: "uint256", name: "" }],
    inputs: [
      { type: "int128", name: "i" },
      { type: "int128", name: "j" },
      { type: "uint256", name: "dx" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    name: "exchange",
    outputs: [{ type: "uint256", name: "" }],
    inputs: [
      { type: "int128", name: "i" },
      { type: "int128", name: "j" },
      { type: "uint256", name: "dx" },
      { type: "uint256", name: "min_dy" },
    ],
    stateMutability: "payable",
    type: "function",
  },
] as const;

export { ERC20_ABI } from "../uniswap/constants";
