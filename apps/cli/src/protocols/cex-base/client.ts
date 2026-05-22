import ccxt, { type Exchange, type MarketInterface, type Position } from "ccxt";
import type {
  CexBalance,
  CexOrderResult,
  CexPosition,
  CexTicker,
} from "./types";

export interface CexClientOptions {
  apiKey?: string;
  secret?: string;
  password?: string; // OKX passphrase
  sandbox?: boolean;
}

export interface FuturesOrderPreview {
  amount: number;
  contractSize: number;
  isContract: boolean;
  isLinear: boolean;
  price: number;
  symbol: string;
}

export function calculateFuturesOrderAmount(
  sizeUsd: number,
  price: number,
  market: Pick<MarketInterface, "contract" | "contractSize" | "inverse">,
): number {
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`Invalid market price: ${price}`);
  }
  if (market.contract && market.inverse) {
    throw new Error(
      "Inverse futures markets are not supported. Use a linear symbol such as BTC/USDT:USDT.",
    );
  }

  const contractSize =
    market.contract && (market.contractSize ?? 0) > 0
      ? Number(market.contractSize)
      : 1;

  if (market.contract) {
    return sizeUsd / (price * contractSize);
  }

  return sizeUsd / price;
}

export class CexClient {
  protected exchange: Exchange;

  constructor(exchangeId: string, opts: CexClientOptions = {}) {
    const ExchangeClass = (ccxt as Record<string, unknown>)[exchangeId] as
      | (new (
          config: Record<string, unknown>,
        ) => Exchange)
      | undefined;
    if (!ExchangeClass) {
      throw new Error(`Exchange "${exchangeId}" not supported by CCXT`);
    }
    this.exchange = new ExchangeClass({
      apiKey: opts.apiKey,
      secret: opts.secret,
      password: opts.password,
      enableRateLimit: true,
    });
    if (opts.sandbox) {
      this.exchange.setSandboxMode(true);
    }
  }

  async fetchTicker(symbol: string): Promise<CexTicker> {
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

  async fetchBalance(): Promise<CexBalance[]> {
    const balance = await this.exchange.fetchBalance();
    const result: CexBalance[] = [];
    const totals = (balance.total ?? {}) as unknown as Record<string, number>;
    const frees = (balance.free ?? {}) as unknown as Record<string, number>;
    const useds = (balance.used ?? {}) as unknown as Record<string, number>;
    for (const [currency, data] of Object.entries(totals)) {
      const total = Number(data) || 0;
      if (total > 0) {
        const free = Number(frees[currency]) || 0;
        const used = Number(useds[currency]) || 0;
        result.push({ currency, free, used, total });
      }
    }
    return result;
  }

  async fetchPositions(): Promise<CexPosition[]> {
    const positions = await this.exchange.fetchPositions();
    return positions
      .filter((p: Position) => Math.abs(p.contracts ?? 0) > 0)
      .map((p: Position) => ({
        symbol: p.symbol,
        side: (p.side === "long" ? "LONG" : "SHORT") as "LONG" | "SHORT",
        size: Math.abs(p.contracts ?? 0),
        entryPrice: p.entryPrice ?? 0,
        markPrice: p.markPrice ?? 0,
        pnl: p.unrealizedPnl ?? 0,
        leverage: p.leverage ?? 1,
      }));
  }

  async createSpotOrder(
    symbol: string,
    side: "buy" | "sell",
    amount: number,
  ): Promise<CexOrderResult> {
    const order = await this.exchange.createMarketOrder(symbol, side, amount);
    return {
      orderId: order.id,
      symbol: order.symbol,
      side: String(order.side),
      type: "market",
      amount: order.amount,
      price: order.average ?? order.price ?? 0,
      status: String(order.status),
    };
  }

  async createFuturesOrder(
    symbol: string,
    side: "buy" | "sell",
    sizeUsd: number,
    leverage?: number,
  ): Promise<CexOrderResult> {
    const preview = await this.getFuturesOrderPreview(symbol, sizeUsd);
    if (leverage) {
      await this.exchange.setLeverage(leverage, symbol);
    }
    const order = await this.exchange.createMarketOrder(
      symbol,
      side,
      preview.amount,
    );
    return {
      orderId: order.id,
      symbol: order.symbol,
      side: String(order.side),
      type: "market",
      amount: order.amount,
      price: order.average ?? order.price ?? 0,
      status: String(order.status),
    };
  }

  async fetchMarkets(): Promise<MarketInterface[]> {
    const markets = await this.exchange.fetchMarkets();
    return markets.filter((market): market is MarketInterface =>
      Boolean(market),
    );
  }

  async getFuturesOrderPreview(
    symbol: string,
    sizeUsd: number,
  ): Promise<FuturesOrderPreview> {
    await this.exchange.loadMarkets();
    const market = this.exchange.market(symbol);
    const ticker = await this.fetchTicker(symbol);
    const rawAmount = calculateFuturesOrderAmount(sizeUsd, ticker.last, market);
    const amount = Number(this.exchange.amountToPrecision(symbol, rawAmount));

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(
        `Calculated order amount is invalid for ${symbol}. Try a larger position size.`,
      );
    }

    return {
      symbol,
      amount,
      contractSize:
        market.contract && (market.contractSize ?? 0) > 0
          ? Number(market.contractSize)
          : 1,
      isContract: market.contract,
      isLinear: Boolean(market.linear),
      price: ticker.last,
    };
  }
}
