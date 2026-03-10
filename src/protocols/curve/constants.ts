import type { Address } from "viem";

// Curve Router (supports multi-hop swaps across pools)
export const CURVE_ROUTER: Record<string, Address> = {
  ethereum: "0xF0d4c12A5768D806021F80a262B4d39d26C58b8D",
  arbitrum: "0xF0d4c12A5768D806021F80a262B4d39d26C58b8D",
  optimism: "0xF0d4c12A5768D806021F80a262B4d39d26C58b8D",
  polygon: "0xF0d4c12A5768D806021F80a262B4d39d26C58b8D",
  base: "0xd6681e74eEA20d196c824C7e6BC4b8a3e6e06F37",
};

export type CurvePoolConfig = { address: Address; name: string; tokens: string[]; tokenAddresses: Address[]; decimals: number[] };

// Curve pools per chain
export const CURVE_POOLS: Record<string, Record<string, CurvePoolConfig>> = {
  ethereum: {
    "3pool": {
      address: "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7",
      name: "3pool (DAI/USDC/USDT)",
      tokens: ["DAI", "USDC", "USDT"],
      tokenAddresses: [
        "0x6B175474E89094C44Da98b954EedeAC495271d0F",
        "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      ],
      decimals: [18, 6, 6],
    },
    steth: {
      address: "0xDC24316b9AE028F1497c275EB9192a3Ea0f67022",
      name: "stETH (ETH/stETH)",
      tokens: ["ETH", "stETH"],
      tokenAddresses: [
        "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
      ],
      decimals: [18, 18],
    },
    tricrypto2: {
      address: "0xD51a44d3FaE010294C616388b506AcdA1bfAAE46",
      name: "tricrypto2 (USDT/WBTC/WETH)",
      tokens: ["USDT", "WBTC", "WETH"],
      tokenAddresses: [
        "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
        "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      ],
      decimals: [6, 8, 18],
    },
  },
  arbitrum: {
    "2pool": {
      address: "0x7f90122BF0700F9E7e1F688fe926940E8839F353",
      name: "2pool (USDC/USDT)",
      tokens: ["USDC", "USDT"],
      tokenAddresses: [
        "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
        "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
      ],
      decimals: [6, 6],
    },
    tricrypto: {
      address: "0x960ea3e3C7FB317332d990873d354E18d7645590",
      name: "tricrypto (USDT/WBTC/WETH)",
      tokens: ["USDT", "WBTC", "WETH"],
      tokenAddresses: [
        "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
        "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
        "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      ],
      decimals: [6, 8, 18],
    },
  },
  optimism: {
    "3pool": {
      address: "0x1337BedC9D22ecbe766dF105c9623922A27963EC",
      name: "3pool (DAI/USDC/USDT)",
      tokens: ["DAI", "USDC", "USDT"],
      tokenAddresses: [
        "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
        "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
        "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
      ],
      decimals: [18, 6, 6],
    },
  },
  polygon: {
    aave: {
      address: "0x445FE580eF8d70FF569aB36e80c647af338db351",
      name: "aave (DAI/USDC/USDT)",
      tokens: ["DAI", "USDC", "USDT"],
      tokenAddresses: [
        "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
        "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
        "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
      ],
      decimals: [18, 6, 6],
    },
  },
  base: {
    "4pool": {
      address: "0xf6C5F01C7F3148891ad0e19DF78743D31E390D1f",
      name: "4pool (DAI/USDC/USDT/USDbC)",
      tokens: ["DAI", "USDC", "USDT", "USDbC"],
      tokenAddresses: [
        "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
        "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
        "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA",
      ],
      decimals: [18, 6, 6, 6],
    },
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
