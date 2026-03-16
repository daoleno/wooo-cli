export interface MorphoMarketSummary {
  chain: string;
  marketId: string;
  loanToken: string;
  collateralToken: string;
  borrowAPY: string;
  supplyAPY: string;
  totalLiquidity: string;
  lltv: string;
}

export interface MorphoMarketDetail {
  chain: string;
  marketId: string;
  loanToken: string;
  loanTokenAddress: string;
  collateralToken: string;
  collateralTokenAddress: string;
  oracle: string;
  irm: string;
  borrowAPY: string;
  supplyAPY: string;
  utilization: string;
  totalLiquidity: string;
  totalSupply: string;
  totalBorrow: string;
  lltv: string;
  lastUpdate: string;
}

export interface MorphoPositionSummary {
  chain: string;
  marketId: string;
  loanToken: string;
  collateralToken: string;
  supplied: string;
  borrowed: string;
  collateral: string;
  maxBorrowable: string;
  healthFactor: string;
  healthy: boolean | null;
}

export type MorphoWriteCommand =
  | "supply"
  | "withdraw"
  | "borrow"
  | "repay"
  | "supply-collateral"
  | "withdraw-collateral";

export type MorphoAssetType = "loan" | "collateral";
export type MorphoAmountMode = "assets" | "shares";

export interface MorphoPreparedWrite {
  chain: string;
  command: MorphoWriteCommand;
  marketId: string;
  marketLabel: string;
  morphoAddress: string;
  loanToken: string;
  collateralToken: string;
  token: string;
  tokenAddress: string;
  tokenDecimals: number;
  assetType: MorphoAssetType;
  amountDisplay: string;
  amountWei: bigint;
  shares: bigint;
  sharesDisplay: string | null;
  all: boolean;
  mode: MorphoAmountMode;
  requiresApproval: boolean;
  marketParams: {
    loanToken: string;
    collateralToken: string;
    oracle: string;
    irm: string;
    lltv: bigint;
  };
}

export interface MorphoWriteResult {
  txHash: string;
  status: "confirmed" | "failed";
  chain: string;
  command: MorphoWriteCommand;
  marketId: string;
  token: string;
  amount: string;
  mode: MorphoAmountMode;
  shares: string | null;
  all: boolean;
}
