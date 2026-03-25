import {
  createConfig,
  getQuote as sdkGetQuote,
  getStatus as sdkGetStatus,
  getChains as sdkGetChains,
  getTokens as sdkGetTokens,
} from "@lifi/sdk";
import type { LifiQuote, LifiStatus } from "./types";

// Initialize SDK once
createConfig({
  integrator: "wooo-cli",
  apiKey: process.env.WOOO_LIFI_API_KEY,
});

export interface LifiQuoteParams {
  fromChain: number;
  toChain: number;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  fromAddress: string;
  slippage?: number;
}

export class LifiClient {
  async getQuote(params: LifiQuoteParams): Promise<LifiQuote> {
    const result = await sdkGetQuote({
      fromChain: params.fromChain,
      toChain: params.toChain,
      fromToken: params.fromToken,
      toToken: params.toToken,
      fromAmount: params.fromAmount,
      fromAddress: params.fromAddress,
      slippage: params.slippage ?? 0.005,
    });

    const gasCost =
      result.estimate?.gasCosts
        ?.reduce(
          (sum: number, c: { amountUSD?: string }) =>
            sum + Number(c.amountUSD ?? 0),
          0,
        )
        .toFixed(2) ?? "0";
    const bridgeFee =
      result.estimate?.feeCosts
        ?.reduce(
          (sum: number, c: { amountUSD?: string }) =>
            sum + Number(c.amountUSD ?? 0),
          0,
        )
        .toFixed(2) ?? "0";
    const totalFee = (Number(gasCost) + Number(bridgeFee)).toFixed(2);

    return {
      fromChain: String(result.action.fromChainId),
      toChain: String(result.action.toChainId),
      fromToken: result.action.fromToken.symbol,
      toToken: result.action.toToken.symbol,
      fromAmount: result.action.fromAmount,
      toAmount: result.estimate.toAmount,
      bridgeName: result.tool,
      fees: { total: totalFee, gas: gasCost, bridge: bridgeFee },
      estimatedTime: result.estimate.executionDuration,
      transactionRequest: {
        to: result.transactionRequest!.to as string,
        data: result.transactionRequest!.data as string,
        value: String(result.transactionRequest!.value ?? "0"),
        gasLimit: String(result.transactionRequest!.gasLimit ?? "0"),
        gasPrice: result.transactionRequest!.gasPrice
          ? String(result.transactionRequest!.gasPrice)
          : undefined,
      },
      approvalAddress: result.estimate?.approvalAddress,
    };
  }

  async getStatus(
    txHash: string,
    bridge: string | undefined,
    fromChain: number,
    toChain: number,
  ): Promise<LifiStatus> {
    const result = await sdkGetStatus({
      txHash,
      bridge,
      fromChain,
      toChain,
    });
    return {
      status: result.status as LifiStatus["status"],
      substatus: (result.substatus as LifiStatus["substatus"]) ?? null,
      fromChain: String(fromChain),
      toChain: String(toChain),
      txHash,
      bridgeName: result.tool ?? bridge ?? "",
      toAmount: result.toAmount,
    };
  }

  async getChains(
    chainTypes?: string[],
  ): Promise<
    Array<{ id: number; key: string; name: string; chainType: string }>
  > {
    const options = chainTypes
      ? { chainTypes: chainTypes as any }
      : undefined;
    const chains = await sdkGetChains(options);
    return chains.map((c: any) => ({
      id: c.id,
      key: c.key,
      name: c.name,
      chainType: c.chainType,
    }));
  }

  async getTokens(
    chains?: number[],
  ): Promise<
    Record<number, Array<{ symbol: string; address: string; decimals: number }>>
  > {
    const result = await sdkGetTokens(chains ? { chains } : undefined);
    const mapped: Record<
      number,
      Array<{ symbol: string; address: string; decimals: number }>
    > = {};
    const tokens = (result as any).tokens ?? result;
    for (const [chainId, tokenList] of Object.entries(tokens)) {
      mapped[Number(chainId)] = (tokenList as any[]).map((t) => ({
        symbol: t.symbol,
        address: t.address,
        decimals: t.decimals,
      }));
    }
    return mapped;
  }
}
