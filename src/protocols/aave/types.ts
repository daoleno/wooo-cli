export interface AaveSupplyResult {
  txHash: string;
  token: string;
  amount: string;
  status: string;
}

export interface AaveBorrowResult {
  txHash: string;
  token: string;
  amount: string;
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
  token: string;
  supplyAPY: string;
  variableBorrowAPY: string;
  stableBorrowAPY: string;
}
