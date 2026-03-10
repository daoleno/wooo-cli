export interface HyperliquidMarket {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
}

export interface HyperliquidTicker {
  symbol: string;
  last: number;
  high: number;
  low: number;
  volume: number;
  change24h: number;
}

export interface HyperliquidPosition {
  symbol: string;
  side: "LONG" | "SHORT";
  size: number;
  entryPrice: number;
  markPrice: number;
  pnl: number;
  leverage: number;
}

export interface HyperliquidFunding {
  symbol: string;
  fundingRate: number;
  nextFundingTime: number;
}

export interface HyperliquidOrderResult {
  orderId: string;
  symbol: string;
  side: string;
  size: number;
  price: number;
  status: string;
}
