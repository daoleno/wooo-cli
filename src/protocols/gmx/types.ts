export interface GmxPosition {
  symbol: string;
  side: "LONG" | "SHORT";
  size: string;
  collateral: string;
  entryPrice: string;
  markPrice: string;
  pnl: string;
  leverage: string;
}

export interface GmxOrderResult {
  txHash: string;
  symbol: string;
  side: string;
  sizeUsd: string;
  leverage: number;
  status: string;
}
