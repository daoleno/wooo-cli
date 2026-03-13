import {
  type Address,
  encodeFunctionData,
  formatUnits,
  type PublicClient,
  parseUnits,
  type WalletClient,
  zeroAddress,
  zeroHash,
} from "viem";
import {
  getAccountAddress,
  getPublicClient,
  getWalletClient,
} from "../../core/evm";
import {
  ERC20_ABI,
  EXCHANGE_ROUTER_ABI,
  GMX_DATASTORE,
  GMX_EXCHANGE_ROUTER,
  GMX_MARKETS,
  GMX_ORDER_VAULT,
  GMX_READER,
  READER_ABI,
} from "./constants";
import type { GmxOrderResult, GmxPosition } from "./types";

interface GmxRawPosition {
  addresses: {
    market: Address;
  };
  flags: {
    isLong: boolean;
  };
  numbers: {
    collateralAmount: bigint;
    sizeInUsd: bigint;
  };
}

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

    // Step 1: Approve USDC collateral to the GMX Router (spender for sendTokens)
    await this.ensureAllowance(
      market.shortToken, // USDC
      collateralAmount,
      account,
      GMX_EXCHANGE_ROUTER,
      publicClient,
      walletClient,
    );

    // Step 2: Use multicall to atomically: sendTokens → sendWnt → createOrder
    // GMX V2 requires collateral to be in the OrderVault before createOrder is called
    const sendTokensData = encodeFunctionData({
      abi: EXCHANGE_ROUTER_ABI,
      functionName: "sendTokens",
      args: [market.shortToken, GMX_ORDER_VAULT, collateralAmount],
    });

    const sendWntData = encodeFunctionData({
      abi: EXCHANGE_ROUTER_ABI,
      functionName: "sendWnt",
      args: [GMX_ORDER_VAULT, executionFee],
    });

    const createOrderData = encodeFunctionData({
      abi: EXCHANGE_ROUTER_ABI,
      functionName: "createOrder",
      args: [
        {
          receiver: account,
          callbackContract: zeroAddress,
          uiFeeReceiver: zeroAddress,
          market: market.marketToken,
          initialCollateralToken: market.shortToken,
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
    });

    const { request } = await publicClient.simulateContract({
      address: GMX_EXCHANGE_ROUTER,
      abi: EXCHANGE_ROUTER_ABI,
      functionName: "multicall",
      args: [[sendWntData, sendTokensData, createOrderData]],
      value: executionFee,
      account,
    });

    const txHash = await walletClient.writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

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

    return (rawPositions as unknown as readonly GmxRawPosition[])
      .filter((p) => p.numbers.sizeInUsd > 0n)
      .map((p) => {
        const sizeUsd = formatUnits(p.numbers.sizeInUsd, 30);
        const collateral = formatUnits(p.numbers.collateralAmount, 6);
        const leverageNum = Number(sizeUsd) / (Number(collateral) || 1);
        const symbol =
          marketToSymbol[p.addresses.market.toLowerCase()] || "UNKNOWN";

        return {
          symbol,
          side: (p.flags.isLong ? "LONG" : "SHORT") as "LONG" | "SHORT",
          size: sizeUsd,
          collateral,
          entryPrice: "N/A", // Requires oracle price feed
          markPrice: "N/A",
          pnl: "N/A",
          leverage: `${leverageNum.toFixed(1)}x`,
        };
      });
  }

  markets(): string[] {
    return Object.keys(GMX_MARKETS);
  }

  private async ensureAllowance(
    token: Address,
    amount: bigint,
    owner: Address,
    spender: Address,
    publicClient: PublicClient,
    walletClient: WalletClient,
  ): Promise<void> {
    const allowance = (await publicClient.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [owner, spender],
    })) as bigint;

    if (allowance < amount) {
      const { request } = await publicClient.simulateContract({
        address: token,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [spender, amount],
        account: owner,
      });
      const hash = await walletClient.writeContract(request);
      await publicClient.waitForTransactionReceipt({ hash });
    }
  }
}
