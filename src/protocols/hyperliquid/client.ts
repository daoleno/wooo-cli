import ccxt, { type hyperliquid } from "ccxt";
import type { HyperliquidActionContext } from "../../core/signer-protocol";
import type { EvmSigner } from "../../core/signers";
import type {
  HyperliquidFunding,
  HyperliquidOrderResult,
  HyperliquidPosition,
  HyperliquidTicker,
} from "./types";

const DUMMY_PRIVATE_KEY = `0x${"11".repeat(32)}`;

type HyperliquidExchange = hyperliquid & {
  signL1Action: (
    action: Record<string, unknown>,
    nonce: number,
    vaultAddress?: string,
    expiresAfter?: number,
  ) => { r: `0x${string}`; s: `0x${string}`; v: number };
};

interface HyperliquidSigningState {
  command?: string;
  current?: HyperliquidActionContext;
}

function createExchange(
  address?: string,
  signer?: EvmSigner,
  signingState?: HyperliquidSigningState,
): HyperliquidExchange {
  const exchange = new ccxt.hyperliquid(
    address
      ? {
          privateKey: DUMMY_PRIVATE_KEY,
          walletAddress: address,
        }
      : {},
  ) as HyperliquidExchange;

  if (address && signer) {
    exchange.signL1Action = (action, nonce, vaultAddress, expiresAfter) =>
      signer.signHyperliquidL1Action(
        {
          action,
          nonce,
          vaultAddress,
          expiresAfter,
          context: {
            actionType: String(action.type ?? "unknown"),
            ...(signingState?.current ?? {}),
          },
          prompt: {
            action: `Authorize Hyperliquid action for ${address}`,
            details: {
              actionType: String(action.type ?? "unknown"),
              ...(signingState?.current?.symbol
                ? { symbol: signingState.current.symbol }
                : {}),
              ...(signingState?.current?.leverage !== undefined
                ? { leverage: signingState.current.leverage }
                : {}),
            },
          },
        },
        {
          group: "perps",
          protocol: "hyperliquid",
          command: signingState?.command,
        },
      );
  }

  return exchange;
}

export class HyperliquidClient {
  private exchange: HyperliquidExchange;
  private signingState: HyperliquidSigningState;

  constructor(address?: string, signer?: EvmSigner, command?: string) {
    this.signingState = { command };
    this.exchange = createExchange(address, signer, this.signingState);
  }

  async fetchMarkets() {
    return this.exchange.fetchMarkets();
  }

  async setLeverage(leverage: number, symbol: string): Promise<void> {
    this.signingState.current = {
      actionType: "updateLeverage",
      leverage,
      symbol,
    };
    try {
      await this.exchange.setLeverage(leverage, symbol);
    } finally {
      this.signingState.current = undefined;
    }
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
      .filter((position) => Math.abs(position.contracts ?? 0) > 0)
      .map((position) => ({
        symbol: position.symbol,
        side: (position.side === "long" ? "LONG" : "SHORT") as "LONG" | "SHORT",
        size: Math.abs(position.contracts ?? 0),
        entryPrice: position.entryPrice ?? 0,
        markPrice: position.markPrice ?? 0,
        pnl: position.unrealizedPnl ?? 0,
        leverage: position.leverage ?? 1,
      }));
  }

  async createMarketOrder(
    symbol: string,
    side: "buy" | "sell",
    amount: number,
    sizeUsd?: number,
  ): Promise<HyperliquidOrderResult> {
    this.signingState.current = {
      actionType: "order",
      side,
      sizeUsd,
      symbol,
    };
    try {
      const order = await this.exchange.createMarketOrder(symbol, side, amount);
      return {
        orderId: order.id,
        symbol: order.symbol,
        side: String(order.side),
        size: order.amount,
        price: order.average ?? order.price ?? 0,
        status: String(order.status),
      };
    } finally {
      this.signingState.current = undefined;
    }
  }
}
