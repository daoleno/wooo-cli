import { type Address, formatUnits, parseUnits } from "viem";
import {
  getAccountAddress,
  getPublicClient,
  getWalletClient,
} from "../../core/evm";
import {
  CURVE_POOLS,
  CURVE_POOL_ABI,
  ERC20_ABI,
} from "./constants";
import type { CurvePool, CurveSwapResult } from "./types";

const SLIPPAGE_BPS = 30; // 0.3% — stableswaps have low slippage

export class CurveClient {
  private chain: string;

  constructor(
    chain = "ethereum",
    private privateKey?: string,
  ) {
    this.chain = chain;
  }

  /** Find which pool contains both tokens and return pool info + indices */
  private resolvePool(tokenIn: string, tokenOut: string) {
    const inUpper = tokenIn.toUpperCase();
    const outUpper = tokenOut.toUpperCase();

    for (const [key, pool] of Object.entries(CURVE_POOLS)) {
      const iIdx = pool.tokens.findIndex((t) => t.toUpperCase() === inUpper);
      const jIdx = pool.tokens.findIndex((t) => t.toUpperCase() === outUpper);
      if (iIdx !== -1 && jIdx !== -1) {
        return {
          key,
          pool,
          i: iIdx,
          j: jIdx,
          decimalsIn: pool.decimals[iIdx],
          decimalsOut: pool.decimals[jIdx],
        };
      }
    }

    throw new Error(
      `No Curve pool found for ${inUpper}/${outUpper}. Available pools: ${Object.values(CURVE_POOLS)
        .map((p) => p.name)
        .join(", ")}`,
    );
  }

  async quote(
    tokenIn: string,
    tokenOut: string,
    amountIn: number,
  ): Promise<{ amountOut: string; pool: string; price: number }> {
    const { pool, i, j, decimalsIn, decimalsOut } = this.resolvePool(tokenIn, tokenOut);
    const publicClient = getPublicClient(this.chain);
    const dx = parseUnits(String(amountIn), decimalsIn);

    const dy = (await publicClient.readContract({
      address: pool.address,
      abi: CURVE_POOL_ABI,
      functionName: "get_dy",
      args: [BigInt(i), BigInt(j), dx],
    })) as bigint;

    const amountOut = Number(formatUnits(dy, decimalsOut));

    return {
      amountOut: amountOut.toFixed(decimalsOut > 8 ? 8 : decimalsOut),
      pool: pool.name,
      price: amountOut / amountIn,
    };
  }

  async swap(
    tokenIn: string,
    tokenOut: string,
    amountIn: number,
  ): Promise<CurveSwapResult> {
    if (!this.privateKey) throw new Error("Private key required for swap");

    const { pool, i, j, decimalsIn, decimalsOut } = this.resolvePool(tokenIn, tokenOut);
    const publicClient = getPublicClient(this.chain);
    const walletClient = getWalletClient(this.privateKey, this.chain);
    const account = getAccountAddress(this.privateKey);
    const dx = parseUnits(String(amountIn), decimalsIn);

    // Get quote for min output
    const dy = (await publicClient.readContract({
      address: pool.address,
      abi: CURVE_POOL_ABI,
      functionName: "get_dy",
      args: [BigInt(i), BigInt(j), dx],
    })) as bigint;

    const minDy = (dy * BigInt(10000 - SLIPPAGE_BPS)) / 10000n;
    const isETHIn = tokenIn.toUpperCase() === "ETH";

    // Approve if not ETH
    if (!isETHIn) {
      const tokenAddress = pool.tokenAddresses[i];
      await this.ensureAllowance(tokenAddress, dx, account, pool.address, publicClient, walletClient);
    }

    const { request } = await publicClient.simulateContract({
      address: pool.address,
      abi: CURVE_POOL_ABI,
      functionName: "exchange",
      args: [BigInt(i), BigInt(j), dx, minDy],
      value: isETHIn ? dx : 0n,
      account,
    });

    const txHash = await walletClient.writeContract(request as any);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    return {
      txHash,
      tokenIn: tokenIn.toUpperCase(),
      tokenOut: tokenOut.toUpperCase(),
      amountIn: amountIn.toString(),
      amountOut: formatUnits(dy, decimalsOut),
      pool: pool.name,
      status: receipt.status === "success" ? "confirmed" : "failed",
    };
  }

  pools(): CurvePool[] {
    return Object.entries(CURVE_POOLS).map(([, pool]) => ({
      name: pool.name,
      address: pool.address,
      tokens: pool.tokens,
    }));
  }

  private async ensureAllowance(
    token: Address,
    amount: bigint,
    owner: Address,
    spender: Address,
    publicClient: any,
    walletClient: any,
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
      const hash = await walletClient.writeContract(request as any);
      await publicClient.waitForTransactionReceipt({ hash });
    }
  }
}
