import { loadWoooConfig } from "../../core/config";
import { ExchangeGateway } from "../../core/exchange-gateway";
import {
  createExecutionPlan,
  createTransactionStep,
  type ExecutionPlan,
} from "../../core/execution-plan";
import type { WriteOperation } from "../../core/write-operation";
import type { CexClientOptions, FuturesOrderPreview } from "./client";
import { CexClient } from "./client";
import type { CexOrderResult } from "./types";

export type AuthResolver = () => Promise<CexClientOptions>;

interface SpotOrderExecutionPlanOptions {
  amount: number;
  command: "buy" | "sell";
  exchangeId: string;
  estimatedPrice: number;
  pair: string;
}

interface FuturesOrderExecutionPlanOptions {
  amount: number;
  command: "long" | "short";
  contractSize: number;
  estimatedPrice: number;
  exchangeId: string;
  leverage: number;
  marketType: string;
  symbol: string;
  sizeUsd: number;
}

export interface SpotOrderParams {
  amount: number;
  exchangeId: string;
  pair: string;
  resolveAuth: AuthResolver;
  side: "buy" | "sell";
}

export interface FuturesOrderParams {
  exchangeId: string;
  leverage: number;
  resolveAuth: AuthResolver;
  side: "long" | "short";
  sizeUsd: number;
  symbol: string;
}

export interface PreparedSpotOrder {
  amount: number;
  estimatedPrice: number;
  exchangeId: string;
  pair: string;
  side: "buy" | "sell";
}

export interface PreparedFuturesOrder {
  exchangeId: string;
  leverage: number;
  preview: FuturesOrderPreview;
  side: "long" | "short";
  sizeUsd: number;
  symbol: string;
}

export function createSpotOrderExecutionPlan(
  options: SpotOrderExecutionPlanOptions,
): ExecutionPlan {
  return createExecutionPlan({
    summary: `${options.command.toUpperCase()} ${options.amount} ${options.pair} on ${options.exchangeId.toUpperCase()}`,
    group: "cex",
    protocol: options.exchangeId,
    command: options.command,
    chain: "exchange",
    accountType: "exchange-api",
    steps: [
      createTransactionStep("Submit spot market order", {
        pair: options.pair,
        side: options.command,
        amount: options.amount,
        estimatedPrice: options.estimatedPrice,
        orderType: "market",
      }),
    ],
    metadata: {
      exchange: options.exchangeId.toUpperCase(),
      pair: options.pair,
      amount: options.amount,
      estimatedPrice: options.estimatedPrice,
    },
  });
}

export function createFuturesOrderExecutionPlan(
  options: FuturesOrderExecutionPlanOptions,
): ExecutionPlan {
  return createExecutionPlan({
    summary: `${options.command.toUpperCase()} ${options.symbol} on ${options.exchangeId.toUpperCase()} with $${options.sizeUsd} at ${options.leverage}x`,
    group: "cex",
    protocol: options.exchangeId,
    command: options.command,
    chain: "exchange",
    accountType: "exchange-api",
    steps: [
      createTransactionStep("Set account leverage", {
        symbol: options.symbol,
        leverage: `${options.leverage}x`,
      }),
      createTransactionStep("Submit futures market order", {
        symbol: options.symbol,
        side: options.command === "long" ? "buy" : "sell",
        sizeUsd: options.sizeUsd,
        amount: options.amount,
        estimatedPrice: options.estimatedPrice,
        contractSize: options.contractSize,
        marketType: options.marketType,
      }),
    ],
    warnings: [
      "Futures positions can be liquidated if margin becomes insufficient.",
    ],
    metadata: {
      exchange: options.exchangeId.toUpperCase(),
      symbol: options.symbol,
      sizeUsd: options.sizeUsd,
      amount: options.amount,
      estimatedPrice: options.estimatedPrice,
      leverage: options.leverage,
      contractSize: options.contractSize,
      marketType: options.marketType,
    },
  });
}

export function createSpotOrderOperation(
  params: SpotOrderParams,
): WriteOperation<PreparedSpotOrder, CexClientOptions, CexOrderResult> {
  return {
    protocol: params.exchangeId,
    prepare: async () => {
      const client = new CexClient(params.exchangeId);
      const ticker = await client.fetchTicker(params.pair);
      return {
        amount: params.amount,
        estimatedPrice: ticker.last,
        exchangeId: params.exchangeId,
        pair: params.pair,
        side: params.side,
      };
    },
    createPreview: (prepared) => ({
      action: `${prepared.side.toUpperCase()} ${prepared.amount} ${prepared.pair}`,
      details: {
        pair: prepared.pair,
        amount: prepared.amount,
        estimatedPrice: `$${prepared.estimatedPrice}`,
        exchange: prepared.exchangeId,
      },
    }),
    createPlan: (prepared) =>
      createSpotOrderExecutionPlan({
        exchangeId: prepared.exchangeId,
        command: prepared.side,
        pair: prepared.pair,
        amount: prepared.amount,
        estimatedPrice: prepared.estimatedPrice,
      }),
    resolveAuth: params.resolveAuth,
    execute: async (prepared, auth) => {
      const gateway = new ExchangeGateway(
        new CexClient(prepared.exchangeId, auth),
      );
      return await gateway.submitSpotMarketOrder(
        prepared.pair,
        prepared.side,
        prepared.amount,
      );
    },
  };
}

export function createFuturesOrderOperation(
  params: FuturesOrderParams,
): WriteOperation<PreparedFuturesOrder, CexClientOptions, CexOrderResult> {
  return {
    protocol: params.exchangeId,
    prepare: async () => {
      const client = new CexClient(params.exchangeId);
      const preview = await client.getFuturesOrderPreview(
        params.symbol,
        params.sizeUsd,
      );
      return {
        exchangeId: params.exchangeId,
        leverage: params.leverage,
        preview,
        side: params.side,
        sizeUsd: params.sizeUsd,
        symbol: params.symbol,
      };
    },
    createPreview: (prepared) => ({
      action: `${prepared.side.toUpperCase()} ${prepared.symbol} with $${prepared.sizeUsd} at ${prepared.leverage}x`,
      details: {
        symbol: prepared.symbol,
        sizeUsd: prepared.sizeUsd,
        amount: prepared.preview.amount.toString(),
        estimatedPrice: `$${prepared.preview.price}`,
        contractSize: prepared.preview.contractSize,
        marketType: prepared.preview.isContract ? "contract" : "spot-like",
        leverage: `${prepared.leverage}x`,
        exchange: prepared.exchangeId,
      },
    }),
    createPlan: (prepared) =>
      createFuturesOrderExecutionPlan({
        exchangeId: prepared.exchangeId,
        command: prepared.side,
        symbol: prepared.symbol,
        sizeUsd: prepared.sizeUsd,
        amount: prepared.preview.amount,
        estimatedPrice: prepared.preview.price,
        contractSize: prepared.preview.contractSize,
        marketType: prepared.preview.isContract ? "contract" : "spot-like",
        leverage: prepared.leverage,
      }),
    resolveAuth: params.resolveAuth,
    execute: async (prepared, auth) => {
      const gateway = new ExchangeGateway(
        new CexClient(prepared.exchangeId, auth),
      );
      return await gateway.submitFuturesMarketOrder(
        prepared.symbol,
        prepared.side === "long" ? "buy" : "sell",
        prepared.sizeUsd,
        prepared.leverage,
      );
    },
  };
}

export async function resolveExchangeAuthFromConfig(
  exchangeId: string,
): Promise<CexClientOptions> {
  const config = await loadWoooConfig();
  const exchangeConfig = config[exchangeId] as
    | Record<string, string>
    | undefined;

  const prefix = `WOOO_${exchangeId.toUpperCase()}_`;
  const apiKey = process.env[`${prefix}API_KEY`] || exchangeConfig?.apiKey;
  const secret =
    process.env[`${prefix}API_SECRET`] || exchangeConfig?.apiSecret;
  const password =
    process.env[`${prefix}PASSPHRASE`] || exchangeConfig?.passphrase;

  if (!apiKey || !secret) {
    console.error(
      `Error: ${exchangeId.toUpperCase()} API credentials not configured.`,
    );
    console.error(
      `Set ${prefix}API_KEY and ${prefix}API_SECRET env vars, or run: wooo-cli config set ${exchangeId}.apiKey <key>`,
    );
    process.exit(3);
  }

  return { apiKey, secret, password };
}
