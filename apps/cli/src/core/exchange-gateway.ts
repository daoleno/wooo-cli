export interface SpotMarketOrderExecutor<TResult> {
  createSpotOrder(
    symbol: string,
    side: "buy" | "sell",
    amount: number,
  ): Promise<TResult>;
}

export interface FuturesMarketOrderExecutor<TResult> {
  createFuturesOrder(
    symbol: string,
    side: "buy" | "sell",
    sizeUsd: number,
    leverage?: number,
  ): Promise<TResult>;
}

export class ExchangeGateway<TResult> {
  constructor(
    private executor: SpotMarketOrderExecutor<TResult> &
      FuturesMarketOrderExecutor<TResult>,
  ) {}

  async submitSpotMarketOrder(
    symbol: string,
    side: "buy" | "sell",
    amount: number,
  ): Promise<TResult> {
    return await this.executor.createSpotOrder(symbol, side, amount);
  }

  async submitFuturesMarketOrder(
    symbol: string,
    side: "buy" | "sell",
    sizeUsd: number,
    leverage?: number,
  ): Promise<TResult> {
    return await this.executor.createFuturesOrder(
      symbol,
      side,
      sizeUsd,
      leverage,
    );
  }
}
