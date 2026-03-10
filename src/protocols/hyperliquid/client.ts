import ccxt, { type hyperliquid } from "ccxt";
import type {
  HyperliquidFunding,
  HyperliquidOrderResult,
  HyperliquidPosition,
  HyperliquidTicker,
} from "./types";

export class HyperliquidClient {
  private exchange: hyperliquid;

  constructor(privateKey?: string) {
    if (privateKey) {
      const { privateKeyToAccount } = require("viem/accounts");
      const account = privateKeyToAccount(privateKey as `0x${string}`);
      this.exchange = new ccxt.hyperliquid({
        privateKey,
        walletAddress: account.address,
      });
    } else {
      this.exchange = new ccxt.hyperliquid({});
    }
  }

  async fetchMarkets() {
    return this.exchange.fetchMarkets();
  }

  async setLeverage(leverage: number, symbol: string): Promise<void> {
    await this.exchange.setLeverage(leverage, symbol);
  }

  async fetchTicker(symbol: string): Promise<HyperliquidTicker> {
    const ticker = await this.exchange.fetchTicker(symbol);
    return {
      symbol: ticker.symbol,
      last: ticker.last ?? 0,
      high: ticker.high ?? 0,
      low: ticker.low ?? 0,
      volume: ticker.baseVolume ?? 0,
      change24h: ticker.percentage ?? 0,
    };
  }

  async fetchFundingRate(symbol: string): Promise<HyperliquidFunding> {
    const funding = await this.exchange.fetchFundingRate(symbol);
    return {
      symbol: funding.symbol,
      fundingRate: funding.fundingRate ?? 0,
      nextFundingTime: funding.fundingTimestamp ?? 0,
    };
  }

  async fetchPositions(): Promise<HyperliquidPosition[]> {
    const positions = await this.exchange.fetchPositions();
    return positions
      .filter((p) => Math.abs(p.contracts ?? 0) > 0)
      .map((p) => ({
        symbol: p.symbol,
        side: (p.side === "long" ? "LONG" : "SHORT") as "LONG" | "SHORT",
        size: Math.abs(p.contracts ?? 0),
        entryPrice: p.entryPrice ?? 0,
        markPrice: p.markPrice ?? 0,
        pnl: p.unrealizedPnl ?? 0,
        leverage: p.leverage ?? 1,
      }));
  }

  async createMarketOrder(
    symbol: string,
    side: "buy" | "sell",
    amount: number,
  ): Promise<HyperliquidOrderResult> {
    const order = await this.exchange.createMarketOrder(symbol, side, amount);
    return {
      orderId: order.id,
      symbol: order.symbol,
      side: String(order.side),
      size: order.amount,
      price: order.average ?? order.price ?? 0,
      status: String(order.status),
    };
  }
}
