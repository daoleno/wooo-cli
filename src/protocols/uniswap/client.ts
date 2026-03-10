import { type Address, formatUnits, parseUnits } from "viem";
import { getAccountAddress, getPublicClient, getWalletClient } from "../../core/evm";
import {
  ERC20_ABI,
  QUOTER_V2_ABI,
  SWAP_ROUTER_ABI,
  getQuoterAddress,
  getSwapRouterAddress,
  resolveToken,
} from "./constants";
import type { UniswapQuote, UniswapSwapResult } from "./types";

const DEFAULT_FEE = 3000; // 0.3% pool fee tier
const SLIPPAGE_BPS = 50; // 0.5% default slippage

export class UniswapClient {
  constructor(
    private chain: string,
    private privateKey?: string,
  ) {}

  async quote(
    tokenInSymbol: string,
    tokenOutSymbol: string,
    amountInHuman: number,
  ): Promise<UniswapQuote> {
    const tokenIn = resolveToken(tokenInSymbol, this.chain);
    const tokenOut = resolveToken(tokenOutSymbol, this.chain);
    if (!tokenIn) throw new Error(`Unknown token: ${tokenInSymbol} on ${this.chain}`);
    if (!tokenOut) throw new Error(`Unknown token: ${tokenOutSymbol} on ${this.chain}`);

    const publicClient = getPublicClient(this.chain);
    const amountIn = parseUnits(String(amountInHuman), tokenIn.decimals);

    const result = await publicClient.simulateContract({
      address: getQuoterAddress(this.chain),
      abi: QUOTER_V2_ABI,
      functionName: "quoteExactInputSingle",
      args: [
        {
          tokenIn: tokenIn.address,
          tokenOut: tokenOut.address,
          amountIn,
          fee: DEFAULT_FEE,
          sqrtPriceLimitX96: 0n,
        },
      ],
    });

    const amountOut = result.result[0];
    const amountOutHuman = Number(formatUnits(amountOut, tokenOut.decimals));
    const price = amountOutHuman / amountInHuman;

    return {
      tokenIn: tokenInSymbol.toUpperCase(),
      tokenOut: tokenOutSymbol.toUpperCase(),
      amountIn: amountInHuman.toString(),
      amountOut: amountOutHuman.toFixed(tokenOut.decimals > 8 ? 8 : tokenOut.decimals),
      price,
      priceImpact: 0, // Simplified — full impl would compare vs pool price
      route: `${tokenInSymbol} → ${tokenOutSymbol} (0.3%)`,
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
    if (!tokenIn) throw new Error(`Unknown token: ${tokenInSymbol} on ${this.chain}`);
    if (!tokenOut) throw new Error(`Unknown token: ${tokenOutSymbol} on ${this.chain}`);

    const publicClient = getPublicClient(this.chain);
    const walletClient = getWalletClient(this.privateKey, this.chain);
    const account = getAccountAddress(this.privateKey);
    const amountIn = parseUnits(String(amountInHuman), tokenIn.decimals);

    // Get quote for min output
    const quoteResult = await this.quote(tokenInSymbol, tokenOutSymbol, amountInHuman);
    const amountOutMin =
      (parseUnits(quoteResult.amountOut, tokenOut.decimals) * BigInt(10000 - SLIPPAGE_BPS)) /
      10000n;

    // Check and set allowance
    await this.ensureAllowance(tokenIn.address, amountIn, account, publicClient, walletClient);

    // Execute swap
    const { request } = await publicClient.simulateContract({
      address: getSwapRouterAddress(this.chain),
      abi: SWAP_ROUTER_ABI,
      functionName: "exactInputSingle",
      args: [
        {
          tokenIn: tokenIn.address,
          tokenOut: tokenOut.address,
          fee: DEFAULT_FEE,
          recipient: account,
          amountIn,
          amountOutMinimum: amountOutMin,
          sqrtPriceLimitX96: 0n,
        },
      ],
      account,
    });

    const txHash = await walletClient.writeContract(request as any);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    return {
      txHash,
      tokenIn: tokenInSymbol.toUpperCase(),
      tokenOut: tokenOutSymbol.toUpperCase(),
      amountIn: amountInHuman.toString(),
      amountOut: quoteResult.amountOut,
      status: receipt.status === "success" ? "confirmed" : "failed",
    };
  }

  private async ensureAllowance(
    token: Address,
    amount: bigint,
    owner: Address,
    publicClient: any,
    walletClient: any,
  ): Promise<void> {
    const allowance = await publicClient.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [owner, getSwapRouterAddress(this.chain)],
    });

    if ((allowance as bigint) < amount) {
      const { request } = await publicClient.simulateContract({
        address: token,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [getSwapRouterAddress(this.chain), amount],
        account: owner,
      });
      const hash = await walletClient.writeContract(request as any);
      await publicClient.waitForTransactionReceipt({ hash });
    }
  }

  async tokens(): Promise<string[]> {
    const { TOKENS } = await import("./constants");
    return Object.keys(TOKENS[this.chain] || {});
  }
}
