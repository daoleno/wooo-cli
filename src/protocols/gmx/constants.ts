import type { Address } from "viem";

// GMX V2 contracts on Arbitrum
export const GMX_ROUTER: Address =
  "0x7C68C7866A64FA2160F78EEaE12217FFbf871fa8";

export const GMX_EXCHANGE_ROUTER: Address =
  "0x69C527fC77291722b52649E45c838e41be8Bf5d5";

export const GMX_READER: Address =
  "0xf60becbba223EEA9495Da3f606753867eC10d139";

export const GMX_DATASTORE: Address =
  "0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8";

// GMX V2 market tokens (Arbitrum)
export const GMX_MARKETS: Record<string, { marketToken: Address; indexToken: Address; longToken: Address; shortToken: Address }> = {
  "BTC/USD": {
    marketToken: "0x47c031236e19d024b42f8AE6DA7A02FAdBd9f5a4",
    indexToken: "0x47904963fc8b2340414262125aF798B9655E58Cd", // WBTC
    longToken: "0x47904963fc8b2340414262125aF798B9655E58Cd",  // WBTC
    shortToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // USDC
  },
  "ETH/USD": {
    marketToken: "0x70d95587d40A2caf56bd97485aB3Eec10Bee6336",
    indexToken: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", // WETH
    longToken: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",  // WETH
    shortToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // USDC
  },
};

// Simplified ABIs for GMX V2
export const EXCHANGE_ROUTER_ABI = [
  {
    inputs: [
      {
        components: [
          { name: "receiver", type: "address" },
          { name: "callbackContract", type: "address" },
          { name: "uiFeeReceiver", type: "address" },
          { name: "market", type: "address" },
          { name: "initialCollateralToken", type: "address" },
          { name: "swapPath", type: "address[]" },
          { name: "sizeDeltaUsd", type: "uint256" },
          { name: "initialCollateralDeltaAmount", type: "uint256" },
          { name: "triggerPrice", type: "uint256" },
          { name: "acceptablePrice", type: "uint256" },
          { name: "executionFee", type: "uint256" },
          { name: "callbackGasLimit", type: "uint256" },
          { name: "minOutputAmount", type: "uint256" },
          { name: "orderType", type: "uint8" },
          { name: "decreasePositionSwapType", type: "uint8" },
          { name: "isLong", type: "bool" },
          { name: "shouldUnwrapNativeToken", type: "bool" },
          { name: "referralCode", type: "bytes32" },
        ],
        name: "params",
        type: "tuple",
      },
    ],
    name: "createOrder",
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "payable",
    type: "function",
  },
] as const;

export const READER_ABI = [
  {
    inputs: [
      { name: "dataStore", type: "address" },
      { name: "account", type: "address" },
      { name: "start", type: "uint256" },
      { name: "end", type: "uint256" },
    ],
    name: "getAccountPositions",
    outputs: [
      {
        components: [
          {
            components: [
              { name: "account", type: "address" },
              { name: "market", type: "address" },
              { name: "collateralToken", type: "address" },
            ],
            name: "addresses",
            type: "tuple",
          },
          {
            components: [
              { name: "sizeInUsd", type: "uint256" },
              { name: "sizeInTokens", type: "uint256" },
              { name: "collateralAmount", type: "uint256" },
              { name: "borrowingFactor", type: "uint256" },
              { name: "fundingFeeAmountPerSize", type: "uint256" },
              { name: "longTokenClaimableFundingAmountPerSize", type: "uint256" },
              { name: "shortTokenClaimableFundingAmountPerSize", type: "uint256" },
              { name: "increasedAtBlock", type: "uint256" },
              { name: "decreasedAtBlock", type: "uint256" },
              { name: "increasedAtTime", type: "uint256" },
              { name: "decreasedAtTime", type: "uint256" },
            ],
            name: "numbers",
            type: "tuple",
          },
          {
            components: [{ name: "isLong", type: "bool" }],
            name: "flags",
            type: "tuple",
          },
        ],
        name: "",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;
