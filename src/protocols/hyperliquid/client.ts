import ccxt, { type hyperliquid } from "ccxt";
import type {
  HyperliquidActionContext,
  HyperliquidActionSignature,
  HyperliquidActionSigningRequest,
} from "../../core/signer-protocol";
import type { WoooSigner } from "../../core/signers";
import type {
  HyperliquidFunding,
  HyperliquidOrderResult,
  HyperliquidPosition,
  HyperliquidTicker,
} from "./types";

const DUMMY_PRIVATE_KEY = `0x${"11".repeat(32)}`;
const PLACEHOLDER_SIGNATURE = {
  r: `0x${"00".repeat(32)}`,
  s: `0x${"00".repeat(32)}`,
  v: 27,
} as const;

type HyperliquidOrderSide = "buy" | "sell";

interface HyperliquidMarketLike {
  baseId?: string;
  symbol?: string;
}

interface HyperliquidOrderRequest {
  amount: number;
  price: number;
  side: HyperliquidOrderSide;
  symbol: string;
}

interface HyperliquidExchangeInternal extends hyperliquid {
  createOrdersRequest(
    orders: Array<{
      amount: number;
      params?: Record<string, unknown>;
      price: number;
      side: string;
      symbol: string;
      type: string;
    }>,
    params?: Record<string, unknown>,
  ): Record<string, unknown>;
  privatePostExchange(
    request: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
  signL1Action(
    action: Record<string, unknown>,
    nonce: number,
    vaultAddress?: string,
    expiresAfter?: number,
  ): HyperliquidActionSignature;
}

function createExchange(address?: string): HyperliquidExchangeInternal {
  return new ccxt.hyperliquid(
    address
      ? {
          privateKey: DUMMY_PRIVATE_KEY,
          walletAddress: address,
        }
      : {},
  ) as HyperliquidExchangeInternal;
}

function normalizeOrderStatus(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0) {
    return "open";
  }

  const normalized = raw.toLowerCase();
  if (normalized === "filled") {
    return "closed";
  }
  return normalized;
}

export class HyperliquidClient {
  private address?: string;
  private command?: string;
  private exchange: HyperliquidExchangeInternal;
  private signer?: WoooSigner;

  constructor(address?: string, signer?: WoooSigner, command?: string) {
    this.address = address;
    this.command = command;
    this.exchange = createExchange(address);
    this.signer = signer;
  }

  private requireSigner(): WoooSigner {
    if (!this.signer) {
      throw new Error("Hyperliquid write operation requires an active signer");
    }
    return this.signer;
  }

  private createPromptAction(): string {
    return `Authorize Hyperliquid action for ${this.address ?? "wallet"}`;
  }

  private async signAction(
    request: HyperliquidActionSigningRequest,
  ): Promise<HyperliquidActionSignature> {
    return await this.requireSigner().signHyperliquidL1Action(request, {
      group: "perps",
      protocol: "hyperliquid",
      command: this.command,
    });
  }

  private async submitAction(
    action: Record<string, unknown>,
    request: Omit<HyperliquidActionSigningRequest, "action" | "nonce"> & {
      context?: HyperliquidActionContext;
      prompt?: HyperliquidActionSigningRequest["prompt"];
      nonce?: number;
    },
  ): Promise<Record<string, unknown>> {
    const nonce = request.nonce ?? Date.now();
    const signature = await this.signAction({
      action,
      nonce,
      vaultAddress: request.vaultAddress,
      expiresAfter: request.expiresAfter,
      sandbox: request.sandbox,
      context: request.context,
      prompt: request.prompt,
    });

    const payload: Record<string, unknown> = {
      action,
      nonce,
      signature,
    };

    if (request.vaultAddress !== undefined) {
      payload.vaultAddress = request.vaultAddress;
    }
    if (request.expiresAfter !== undefined) {
      payload.expiresAfter = request.expiresAfter;
    }

    return await this.exchange.privatePostExchange(payload);
  }

  private buildUnsignedOrderRequest(
    order: HyperliquidOrderRequest,
  ): Record<string, unknown> {
    const originalSignL1Action = this.exchange.signL1Action.bind(this.exchange);

    this.exchange.signL1Action = () => PLACEHOLDER_SIGNATURE;

    try {
      return this.exchange.createOrdersRequest([
        {
          symbol: order.symbol,
          type: "market",
          side: order.side,
          amount: order.amount,
          price: order.price,
        },
      ]);
    } finally {
      this.exchange.signL1Action = originalSignL1Action;
    }
  }

  private parseOrderResult(
    response: Record<string, unknown>,
    fallback: HyperliquidOrderRequest,
  ): HyperliquidOrderResult {
    const statuses = ((
      (response.response as Record<string, unknown> | undefined)?.data as
        | Record<string, unknown>
        | undefined
    )?.statuses ?? []) as unknown[];
    const firstStatus = statuses[0];

    if (!firstStatus) {
      throw new Error("Hyperliquid order response did not include any status");
    }

    if (typeof firstStatus === "string") {
      return {
        orderId: "",
        symbol: fallback.symbol,
        side: fallback.side,
        size: fallback.amount,
        price: fallback.price,
        status: normalizeOrderStatus(firstStatus),
      };
    }

    if (typeof firstStatus !== "object" || Array.isArray(firstStatus)) {
      throw new Error("Hyperliquid order response returned an invalid status");
    }

    const statusRecord = firstStatus as Record<string, unknown>;
    if (typeof statusRecord.error === "string") {
      throw new Error(statusRecord.error);
    }

    let normalized = statusRecord;
    if (statusRecord.resting && typeof statusRecord.resting === "object") {
      normalized = {
        ...statusRecord,
        ccxtStatus: "open",
        resting: {
          ...(statusRecord.resting as Record<string, unknown>),
          id:
            (statusRecord.resting as Record<string, unknown>).oid?.toString() ??
            undefined,
        },
      };
    } else if (statusRecord.filled && typeof statusRecord.filled === "object") {
      normalized = {
        ...statusRecord,
        ccxtStatus: "filled",
        filled: {
          ...(statusRecord.filled as Record<string, unknown>),
          id:
            (statusRecord.filled as Record<string, unknown>).oid?.toString() ??
            undefined,
        },
      };
    }

    const parsed = this.exchange.parseOrder(normalized);

    return {
      orderId: parsed.id ?? "",
      symbol: parsed.symbol ?? fallback.symbol,
      side: parsed.side ?? fallback.side,
      size: parsed.amount ?? fallback.amount,
      price: parsed.average ?? parsed.price ?? fallback.price,
      status: parsed.status ?? "open",
    };
  }

  async fetchMarkets() {
    return this.exchange.fetchMarkets();
  }

  async setLeverage(leverage: number, symbol: string): Promise<void> {
    await this.exchange.loadMarkets();
    const market = this.exchange.market(
      symbol,
    ) as unknown as HyperliquidMarketLike;
    const asset = Number.parseInt(String(market.baseId), 10);

    if (!Number.isFinite(asset)) {
      throw new Error(
        `Could not resolve Hyperliquid market asset for ${symbol}`,
      );
    }

    await this.submitAction(
      {
        type: "updateLeverage",
        asset,
        isCross: true,
        leverage,
      },
      {
        context: {
          actionType: "updateLeverage",
          leverage,
          symbol,
        },
        prompt: {
          action: this.createPromptAction(),
        },
      },
    );
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
    side: HyperliquidOrderSide,
    amount: number,
    sizeUsd: number | undefined,
    price: number,
  ): Promise<HyperliquidOrderResult> {
    await this.exchange.loadMarkets();

    const unsignedRequest = this.buildUnsignedOrderRequest({
      symbol,
      side,
      amount,
      price,
    });

    const response = await this.submitAction(
      unsignedRequest.action as Record<string, unknown>,
      {
        nonce: Number(unsignedRequest.nonce),
        vaultAddress:
          typeof unsignedRequest.vaultAddress === "string"
            ? unsignedRequest.vaultAddress
            : undefined,
        context: {
          actionType: "order",
          side,
          sizeUsd,
          symbol,
        },
        prompt: {
          action: this.createPromptAction(),
        },
      },
    );

    return this.parseOrderResult(response, {
      symbol,
      side,
      amount,
      price,
    });
  }
}
