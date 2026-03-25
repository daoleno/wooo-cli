import {
  type BridgeTokenMetadata,
  findTokenMatch,
  getNativeTokenMetadata,
} from "../bridge/token-resolution";
import type { LifiQuote, LifiStatus } from "./types";

let sdkInitialized = false;

async function ensureSdkInitialized() {
  if (sdkInitialized) return;
  const { createConfig } = await import("@lifi/sdk");
  createConfig({
    integrator: "wooo-cli",
    apiKey: process.env.WOOO_LIFI_API_KEY,
  });
  sdkInitialized = true;
}

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
  async resolveToken(
    chain: string,
    chainId: number,
    token: string,
  ): Promise<BridgeTokenMetadata> {
    const nativeToken = getNativeTokenMetadata(chain, token);
    if (nativeToken) return nativeToken;

    const tokensByChain = await this.getTokens([chainId]);
    const tokens = tokensByChain[chainId] ?? [];
    const resolved = findTokenMatch(tokens, token);
    if (!resolved) {
      throw new Error(`Unsupported token ${token} on ${chain}`);
    }
    return resolved;
  }

  async getQuote(params: LifiQuoteParams): Promise<LifiQuote> {
    await ensureSdkInitialized();
    const { getQuote: sdkGetQuote } = await import("@lifi/sdk");
    const result = await sdkGetQuote({
      fromChain: params.fromChain,
      toChain: params.toChain,
      fromToken: params.fromToken,
      toToken: params.toToken,
      fromAmount: params.fromAmount,
      fromAddress: params.fromAddress,
      slippage: params.slippage ?? 0.005,
    });
    if (!result.transactionRequest) {
      throw new Error("LI.FI quote did not include a transaction request");
    }
    const transactionRequest = result.transactionRequest;

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
      fromTokenAddress: result.action.fromToken.address,
      toTokenAddress: result.action.toToken.address,
      fromToken: result.action.fromToken.symbol,
      toToken: result.action.toToken.symbol,
      fromTokenDecimals: result.action.fromToken.decimals,
      toTokenDecimals: result.action.toToken.decimals,
      fromAmount: result.action.fromAmount,
      toAmount: result.estimate.toAmount,
      bridgeName: result.tool,
      fees: { total: totalFee, gas: gasCost, bridge: bridgeFee },
      estimatedTime: result.estimate.executionDuration,
      transactionRequest: {
        to: transactionRequest.to as string,
        data: transactionRequest.data as string,
        value: String(transactionRequest.value ?? "0"),
        gasLimit: String(transactionRequest.gasLimit ?? "0"),
        gasPrice: transactionRequest.gasPrice
          ? String(transactionRequest.gasPrice)
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
    await ensureSdkInitialized();
    const { getStatus: sdkGetStatus } = await import("@lifi/sdk");
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
      bridgeName: (result as any).tool ?? bridge ?? "",
      toAmount: (result as any).toAmount,
    };
  }

  async getChains(
    chainTypes?: string[],
  ): Promise<
    Array<{ id: number; key: string; name: string; chainType: string }>
  > {
    await ensureSdkInitialized();
    const { getChains: sdkGetChains } = await import("@lifi/sdk");
    const options = chainTypes ? { chainTypes: chainTypes as any } : undefined;
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
  ): Promise<Record<number, BridgeTokenMetadata[]>> {
    await ensureSdkInitialized();
    const { getTokens: sdkGetTokens } = await import("@lifi/sdk");
    const result = await sdkGetTokens(chains ? { chains } : undefined);
    const mapped: Record<number, BridgeTokenMetadata[]> = {};
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
