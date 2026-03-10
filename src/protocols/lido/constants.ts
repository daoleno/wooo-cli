import type { Address } from "viem";

// Lido stETH contract on Ethereum mainnet
export const STETH_ADDRESS: Address =
  "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84";

// Lido withdrawal queue (for unstaking)
export const WITHDRAWAL_QUEUE_ADDRESS: Address =
  "0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1";

// wstETH (wrapped staked ETH)
export const WSTETH_ADDRESS: Address =
  "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0";

export const STETH_ABI = [
  {
    inputs: [{ name: "_referral", type: "address" }],
    name: "submit",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [{ name: "_account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "_account", type: "address" }],
    name: "sharesOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "_sharesAmount", type: "uint256" }],
    name: "getPooledEthByShares",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const WITHDRAWAL_QUEUE_ABI = [
  {
    inputs: [
      { name: "_amounts", type: "uint256[]" },
      { name: "_owner", type: "address" },
    ],
    name: "requestWithdrawals",
    outputs: [{ name: "requestIds", type: "uint256[]" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;
