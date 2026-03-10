import { formatUnits, parseUnits, zeroAddress, zeroHash } from "viem";
import { getAccountAddress, getPublicClient, getWalletClient } from "../../core/evm";
import {
  GMX_DATASTORE,
  GMX_EXCHANGE_ROUTER,
  GMX_MARKETS,
  GMX_READER,
  EXCHANGE_ROUTER_ABI,
  READER_ABI,
} from "./constants";
import type { GmxOrderResult, GmxPosition } from "./types";

export class GmxClient {
  private chain = "arbitrum"; // GMX V2 is on Arbitrum

  constructor(private privateKey?: string) {}

  async openPosition(
    symbol: string,
    side: "long" | "short",
    sizeUsd: number,
    leverage: number,
  ): Promise<GmxOrderResult> {
    if (!this.privateKey) throw new Error("Private key required");

    const market = GMX_MARKETS[symbol];
    if (!market) {
      const supported = Object.keys(GMX_MARKETS).join(", ");
      throw new Error(`Unknown GMX market: ${symbol}. Supported: ${supported}`);
    }

    const publicClient = getPublicClient(this.chain);
    const walletClient = getWalletClient(this.privateKey, this.chain);
    const account = getAccountAddress(this.privateKey);

    // Size in USD with 30 decimals (GMX convention)
    const sizeDeltaUsd = parseUnits(String(sizeUsd), 30);
    const collateralAmount = parseUnits(String(sizeUsd / leverage), 6); // USDC collateral

    const isLong = side === "long";
    const executionFee = parseUnits("0.001", 18); // ~0.001 ETH execution fee

    const { request } = await publicClient.simulateContract({
      address: GMX_EXCHANGE_ROUTER,
      abi: EXCHANGE_ROUTER_ABI,
      functionName: "createOrder",
      args: [
        {
          receiver: account,
          callbackContract: zeroAddress,
          uiFeeReceiver: zeroAddress,
          market: market.marketToken,
          initialCollateralToken: market.shortToken, // USDC as collateral
          swapPath: [],
          sizeDeltaUsd,
          initialCollateralDeltaAmount: collateralAmount,
          triggerPrice: 0n,
          acceptablePrice: isLong
            ? parseUnits("999999", 30) // Max acceptable for long
            : 0n, // Min acceptable for short
          executionFee,
          callbackGasLimit: 0n,
          minOutputAmount: 0n,
          orderType: 2, // MarketIncrease
          decreasePositionSwapType: 0,
          isLong,
          shouldUnwrapNativeToken: false,
          referralCode: zeroHash,
        },
      ],
      value: executionFee,
      account,
    });

    const txHash = await walletClient.writeContract(request as any);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    return {
      txHash,
      symbol,
      side: side.toUpperCase(),
      sizeUsd: sizeUsd.toString(),
      leverage,
      status: receipt.status === "success" ? "submitted" : "failed",
    };
  }

  async positions(): Promise<GmxPosition[]> {
    if (!this.privateKey) throw new Error("Private key required");

    const publicClient = getPublicClient(this.chain);
    const account = getAccountAddress(this.privateKey);

    const rawPositions = await publicClient.readContract({
      address: GMX_READER,
      abi: READER_ABI,
      functionName: "getAccountPositions",
      args: [GMX_DATASTORE, account, 0n, 100n],
    });

    // Map market token addresses to symbols
    const marketToSymbol: Record<string, string> = {};
    for (const [symbol, info] of Object.entries(GMX_MARKETS)) {
      marketToSymbol[info.marketToken.toLowerCase()] = symbol;
    }

    return (rawPositions as any[])
      .filter((p: any) => p.numbers.sizeInUsd > 0n)
      .map((p: any) => {
        const sizeUsd = formatUnits(p.numbers.sizeInUsd, 30);
        const collateral = formatUnits(p.numbers.collateralAmount, 6);
        const leverageNum =
          Number(sizeUsd) / (Number(collateral) || 1);
        const symbol =
          marketToSymbol[p.addresses.market.toLowerCase()] || "UNKNOWN";

        return {
          symbol,
          side: (p.flags.isLong ? "LONG" : "SHORT") as "LONG" | "SHORT",
          size: sizeUsd,
          collateral,
          entryPrice: "N/A", // Would need oracle prices
          markPrice: "N/A",
          pnl: "N/A",
          leverage: `${leverageNum.toFixed(1)}x`,
        };
      });
  }

  markets(): string[] {
    return Object.keys(GMX_MARKETS);
  }
}
