export interface CexTicker {
  symbol: string;
  last: number;
  high: number;
  low: number;
  volume: number;
  change24h: number;
}

export interface CexBalance {
  currency: string;
  free: number;
  used: number;
  total: number;
}

export interface CexPosition {
  symbol: string;
  side: "LONG" | "SHORT";
  size: number;
  entryPrice: number;
  markPrice: number;
  pnl: number;
  leverage: number;
}

export interface CexOrderResult {
  orderId: string;
  symbol: string;
  side: string;
  type: string;
  amount: number;
  price: number;
  status: string;
}
