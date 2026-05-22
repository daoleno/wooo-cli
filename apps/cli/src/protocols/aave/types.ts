export interface AaveSupplyResult {
  txHash: string;
  token: string;
  amount: string;
  status: string;
}

export interface AaveWithdrawResult {
  txHash: string;
  token: string;
  amount: string;
  all: boolean;
  status: string;
}

export interface AaveBorrowResult {
  txHash: string;
  token: string;
  amount: string;
  interestRateMode: string;
  status: string;
}

export interface AaveRepayResult {
  txHash: string;
  token: string;
  amount: string;
  all: boolean;
  interestRateMode: string;
  status: string;
}

export interface AavePosition {
  token: string;
  supplied: string;
  borrowed: string;
  supplyAPY: string;
  borrowAPY: string;
}

export interface AaveRate {
  market: string;
  marketAddress: string;
  token: string;
  supplyAPY: string;
  variableBorrowAPY: string;
  stableBorrowAPY: string;
}

export interface AaveMarketSummary {
  market: string;
  marketAddress: string;
  token: string;
  tokenAddress: string;
  decimals: number;
  supplyAPY: string;
  variableBorrowAPY: string;
  stableBorrowAPY: string;
  ltv: string;
  collateralEnabled: boolean;
  borrowingEnabled: boolean;
  stableBorrowEnabled: boolean;
  active: boolean;
  frozen: boolean;
}

export interface AavePositionsSummary {
  market: string;
  marketAddress: string;
  totalCollateralUSD: string;
  totalDebtUSD: string;
  availableBorrowsUSD: string;
  healthFactor: string;
  ltv: string;
}
