import { getActiveSigner, getActiveWallet } from "../../core/context";
import type { WoooSigner } from "../../core/signers";
import type { WriteOperation } from "../../core/write-operation";
import { HyperliquidClient } from "./client";
import { createHyperliquidExecutionPlan } from "./plan";
import type { HyperliquidOrderResult, HyperliquidTicker } from "./types";

export interface HyperliquidOrderParams {
  asset: string;
  leverage: number;
  side: "long" | "short";
  sizeUsd: number;
}

export interface PreparedHyperliquidOrder extends HyperliquidOrderParams {
  amount: string;
  symbol: string;
  ticker: HyperliquidTicker;
}

function getOrderSide(side: "long" | "short"): "buy" | "sell" {
  return side === "long" ? "buy" : "sell";
}

export function createHyperliquidOrderOperation(
  params: HyperliquidOrderParams,
): WriteOperation<
  PreparedHyperliquidOrder,
  WoooSigner,
  HyperliquidOrderResult
> {
  return {
    protocol: "hyperliquid",
    prepare: async () => {
      const symbol = `${params.asset}/USDC:USDC`;
      const client = new HyperliquidClient();
      const ticker = await client.fetchTicker(symbol);
      const amount = (params.sizeUsd / ticker.last).toFixed(6);

      return {
        ...params,
        amount,
        symbol,
        ticker,
      };
    },
    createPreview: (prepared) => ({
      action: `${prepared.side.toUpperCase()} ${prepared.asset} on Hyperliquid`,
      details: {
        symbol: prepared.symbol,
        sizeUsd: prepared.sizeUsd,
        amount: prepared.amount,
        estimatedPrice: `$${prepared.ticker.last}`,
        leverage: `${prepared.leverage}x`,
      },
    }),
    createPlan: (prepared) =>
      createHyperliquidExecutionPlan({
        side: prepared.side,
        symbol: prepared.symbol,
        sizeUsd: prepared.sizeUsd,
        amount: prepared.amount,
        estimatedPrice: prepared.ticker.last,
        leverage: prepared.leverage,
      }),
    resolveAuth: async () => await getActiveSigner("evm"),
    execute: async (prepared, signer) => {
      const wallet = await getActiveWallet("evm");
      const client = new HyperliquidClient(
        wallet.address,
        signer,
        prepared.side,
      );
      await client.setLeverage(prepared.leverage, prepared.symbol);
      return await client.createMarketOrder(
        prepared.symbol,
        getOrderSide(prepared.side),
        Number(prepared.amount),
        prepared.sizeUsd,
        prepared.ticker.last,
      );
    },
  };
}
