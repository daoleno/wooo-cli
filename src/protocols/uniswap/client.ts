import { type Address, formatUnits, parseUnits } from "viem";
import {
  getAccountAddress,
  getPublicClient,
  getWalletClient,
} from "../../core/evm";
import { TxGateway } from "../../core/tx-gateway";
import {
  ERC20_ABI,
  getQuoterAddress,
  getSwapRouterAddress,
  NATIVE_WRAPS,
  QUOTER_V2_ABI,
  resolveToken,
  SWAP_ROUTER_ABI,
  WETH9_ABI,
} from "./constants";
import type { UniswapQuote, UniswapSwapResult } from "./types";

// Fee tiers to try in order of most common
const FEE_TIERS = [3000, 500, 10000, 100] as const;
const SLIPPAGE_BPS = 50; // 0.5% default slippage

type EvmPublicClient = ReturnType<typeof getPublicClient>;
type EvmWalletClient = ReturnType<typeof getWalletClient>;

export class UniswapClient {
  constructor(
    private chain: string,
    private privateKey?: string,
  ) {}

  /**
   * Try multiple fee tiers and return the best quote.
   */
  async quote(
    tokenInSymbol: string,
    tokenOutSymbol: string,
    amountInHuman: number,
  ): Promise<UniswapQuote> {
    const tokenIn = resolveToken(tokenInSymbol, this.chain);
    const tokenOut = resolveToken(tokenOutSymbol, this.chain);
    if (!tokenIn)
      throw new Error(`Unknown token: ${tokenInSymbol} on ${this.chain}`);
    if (!tokenOut)
      throw new Error(`Unknown token: ${tokenOutSymbol} on ${this.chain}`);

    const publicClient = getPublicClient(this.chain);
    const amountIn = parseUnits(String(amountInHuman), tokenIn.decimals);

    // Try all fee tiers and pick the best output
    let bestAmountOut = 0n;
    let bestFee: number = FEE_TIERS[0];

    for (const fee of FEE_TIERS) {
      try {
        const result = await publicClient.simulateContract({
          address: getQuoterAddress(this.chain),
          abi: QUOTER_V2_ABI,
          functionName: "quoteExactInputSingle",
          args: [
            {
              tokenIn: tokenIn.address,
              tokenOut: tokenOut.address,
              amountIn,
              fee,
              sqrtPriceLimitX96: 0n,
            },
          ],
        });

        const amountOut = result.result[0];
        if (amountOut > bestAmountOut) {
          bestAmountOut = amountOut;
          bestFee = fee;
        }
      } catch {
        // This fee tier doesn't have a pool for this pair
      }
    }

    if (bestAmountOut === 0n) {
      throw new Error(
        `No Uniswap V3 pool found for ${tokenInSymbol}/${tokenOutSymbol} on ${this.chain}`,
      );
    }

    const amountOutHuman = Number(
      formatUnits(bestAmountOut, tokenOut.decimals),
    );
    const price = amountOutHuman / amountInHuman;
    const feePct = bestFee / 10000;

    return {
      tokenIn: tokenInSymbol.toUpperCase(),
      tokenOut: tokenOutSymbol.toUpperCase(),
      amountIn: amountInHuman.toString(),
      amountOut: amountOutHuman.toFixed(
        tokenOut.decimals > 8 ? 8 : tokenOut.decimals,
      ),
      price,
      priceImpact: 0,
      route: `${tokenInSymbol} → ${tokenOutSymbol} (${feePct}%)`,
    };
  }

  async swap(
    tokenInSymbol: string,
    tokenOutSymbol: string,
    amountInHuman: number,
  ): Promise<UniswapSwapResult> {
    if (!this.privateKey) throw new Error("Private key required for swap");

    const tokenIn = resolveToken(tokenInSymbol, this.chain);
    const tokenOut = resolveToken(tokenOutSymbol, this.chain);
    if (!tokenIn)
      throw new Error(`Unknown token: ${tokenInSymbol} on ${this.chain}`);
    if (!tokenOut)
      throw new Error(`Unknown token: ${tokenOutSymbol} on ${this.chain}`);

    const publicClient = getPublicClient(this.chain);
    const walletClient = getWalletClient(this.privateKey, this.chain);
    const account = getAccountAddress(this.privateKey);
    const txGateway = new TxGateway(publicClient, walletClient, account);
    const amountIn = parseUnits(String(amountInHuman), tokenIn.decimals);
    const isNativeIn = this.isNativeToken(tokenInSymbol);
    const isNativeOut = this.isNativeToken(tokenOutSymbol);

    // Get quote for min output (try all fee tiers)
    const quoteResult = await this.quote(
      tokenInSymbol,
      tokenOutSymbol,
      amountInHuman,
    );
    const amountOutMin =
      (parseUnits(quoteResult.amountOut, tokenOut.decimals) *
        BigInt(10000 - SLIPPAGE_BPS)) /
      10000n;

    // Determine the best fee from the route string
    const feeMatch = quoteResult.route.match(/\((\d+\.?\d*)%\)/);
    const fee = feeMatch ? Math.round(Number(feeMatch[1]) * 10000) : 3000;

    if (isNativeIn) {
      // Native ETH: wrap to WETH first, then swap
      const wethAddress = tokenIn.address; // resolveToken maps ETH → WETH
      await this.wrapETH(wethAddress, amountIn, txGateway);
    }

    // Approve router to spend tokens (including freshly wrapped WETH)
    await txGateway.ensureAllowance(
      tokenIn.address,
      getSwapRouterAddress(this.chain),
      amountIn,
      ERC20_ABI,
    );

    const wrappedBalanceBefore = isNativeOut
      ? ((await publicClient.readContract({
          address: tokenOut.address,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [account],
        })) as bigint)
      : 0n;

    // Execute swap
    const { receipt, txHash } = await txGateway.simulateAndWriteContract({
      address: getSwapRouterAddress(this.chain),
      abi: SWAP_ROUTER_ABI,
      functionName: "exactInputSingle",
      args: [
        {
          tokenIn: tokenIn.address,
          tokenOut: tokenOut.address,
          fee,
          recipient: account,
          amountIn,
          amountOutMinimum: amountOutMin,
          sqrtPriceLimitX96: 0n,
        },
      ],
    });

    let amountOut = quoteResult.amountOut;
    if (isNativeOut) {
      const unwrappedAmount = await this.unwrapNativeOutput(
        tokenOut.address,
        account,
        wrappedBalanceBefore,
        publicClient,
        walletClient,
      );
      if (unwrappedAmount > 0n) {
        amountOut = Number(
          formatUnits(unwrappedAmount, tokenOut.decimals),
        ).toFixed(tokenOut.decimals > 8 ? 8 : tokenOut.decimals);
      }
    }

    return {
      txHash,
      tokenIn: tokenInSymbol.toUpperCase(),
      tokenOut: tokenOutSymbol.toUpperCase(),
      amountIn: amountInHuman.toString(),
      amountOut,
      status: receipt.status === "success" ? "confirmed" : "failed",
    };
  }

  private isNativeToken(symbol: string): boolean {
    return symbol.toUpperCase() in NATIVE_WRAPS;
  }

  private async wrapETH(
    wethAddress: Address,
    amount: bigint,
    txGateway: TxGateway,
  ): Promise<void> {
    await txGateway.simulateAndWriteContract({
      address: wethAddress,
      abi: WETH9_ABI,
      functionName: "deposit",
      args: [],
      value: amount,
    });
  }

  private async unwrapNativeOutput(
    wrappedToken: Address,
    account: Address,
    balanceBefore: bigint,
    publicClient: EvmPublicClient,
    walletClient: EvmWalletClient,
  ): Promise<bigint> {
    const balanceAfter = (await publicClient.readContract({
      address: wrappedToken,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [account],
    })) as bigint;
    const received =
      balanceAfter > balanceBefore ? balanceAfter - balanceBefore : 0n;

    if (received === 0n) {
      return 0n;
    }

    const { request } = await publicClient.simulateContract({
      address: wrappedToken,
      abi: WETH9_ABI,
      functionName: "withdraw",
      args: [received],
      account,
    });
    const hash = await walletClient.writeContract(request);
    await publicClient.waitForTransactionReceipt({ hash });
    return received;
  }

  async tokens(): Promise<string[]> {
    const { TOKENS } = await import("./constants");
    return Object.keys(TOKENS[this.chain] || {});
  }
}
