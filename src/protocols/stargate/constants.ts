import type { Address } from "viem";

// Stargate V2 Router addresses per chain
export const STARGATE_ROUTER: Record<string, Address> = {
  ethereum: "0x77b2043768d28E9C9aB44E1aBfC95944bcE57931",
  arbitrum: "0x53Bf833A5d6c4ddA888F69c22C88C9f356a41614",
  optimism: "0xB0D502E938ed5f4df2E681fE6E419ff29631d62b",
  polygon: "0x45A01E4e04F14f7A4a6702c74187c5F6222033cd",
  base: "0x45f1A95A4D3f3836523F5c83673c797f4d4d263B",
};

// LayerZero V2 endpoint IDs for each chain
export const LZ_ENDPOINT_IDS: Record<string, number> = {
  ethereum: 30101,
  arbitrum: 30110,
  optimism: 30111,
  polygon: 30109,
  base: 30184,
};

// Stargate pool IDs for common tokens
export const STARGATE_POOLS: Record<string, Record<string, { poolAddress: Address; decimals: number }>> = {
  ethereum: {
    USDC: { poolAddress: "0xc026395860Db2d07ee33e05fE50ed7bD583189C7", decimals: 6 },
    USDT: { poolAddress: "0x933597a323Eb81cAe705C5bC29985172fd5A3973", decimals: 6 },
    ETH: { poolAddress: "0x77b2043768d28E9C9aB44E1aBfC95944bcE57931", decimals: 18 },
  },
  arbitrum: {
    USDC: { poolAddress: "0xe8CDF27AcD73a434D661C84887215F7598e7d0d3", decimals: 6 },
    USDT: { poolAddress: "0xcE8CcA271Ebc0533920C83d39F417ED6A0abB7D0", decimals: 6 },
    ETH: { poolAddress: "0xA45B5130f36CDcA45667738e2a258AB09f4A27F5", decimals: 18 },
  },
  optimism: {
    USDC: { poolAddress: "0xcE8CcA271Ebc0533920C83d39F417ED6A0abB7D0", decimals: 6 },
    ETH: { poolAddress: "0xe8CDF27AcD73a434D661C84887215F7598e7d0d3", decimals: 18 },
  },
  base: {
    USDC: { poolAddress: "0x27a16dc786820B16E5c9028b75B99F6f604b5d26", decimals: 6 },
    ETH: { poolAddress: "0xdc181Bd607330aeeBEF6ea62e03e5e1Fb4B6F7C04", decimals: 18 },
  },
};

// Stargate pool send ABI (simplified)
export const STARGATE_POOL_ABI = [
  {
    inputs: [
      {
        components: [
          { name: "dstEid", type: "uint32" },
          { name: "to", type: "bytes32" },
          { name: "amountLD", type: "uint256" },
          { name: "minAmountLD", type: "uint256" },
          { name: "extraOptions", type: "bytes" },
          { name: "composeMsg", type: "bytes" },
          { name: "oftCmd", type: "bytes" },
        ],
        name: "sendParam",
        type: "tuple",
      },
      {
        components: [
          { name: "nativeFee", type: "uint256" },
          { name: "lzTokenFee", type: "uint256" },
        ],
        name: "fee",
        type: "tuple",
      },
      { name: "refundAddress", type: "address" },
    ],
    name: "send",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          { name: "dstEid", type: "uint32" },
          { name: "to", type: "bytes32" },
          { name: "amountLD", type: "uint256" },
          { name: "minAmountLD", type: "uint256" },
          { name: "extraOptions", type: "bytes" },
          { name: "composeMsg", type: "bytes" },
          { name: "oftCmd", type: "bytes" },
        ],
        name: "sendParam",
        type: "tuple",
      },
      { name: "payInLzToken", type: "bool" },
    ],
    name: "quoteSend",
    outputs: [
      {
        components: [
          { name: "nativeFee", type: "uint256" },
          { name: "lzTokenFee", type: "uint256" },
        ],
        name: "fee",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

export { ERC20_ABI } from "../uniswap/constants";
