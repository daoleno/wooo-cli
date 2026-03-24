import { formatUnits, parseUnits } from "viem";
import { getPublicClient } from "../../core/evm";
import type { WalletPort } from "../../core/signers";
import { TxGateway } from "../../core/tx-gateway";
import {
  CURVE_POOL_ABI,
  CURVE_POOLS,
  type CurvePoolConfig,
  ERC20_ABI,
} from "./constants";
import type { CurvePool, CurveQuote, CurveSwapResult } from "./types";

const NATIVE_TOKEN_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const DEFAULT_SLIPPAGE_BPS = 30n; // 0.3%

interface ResolvedPool {
  config: CurvePoolConfig;
  indexIn: number;
  indexOut: number;
}

export class CurveClient {
  constructor(
    private chain = "ethereum",
    private signer?: WalletPort,
  ) {}

  private getChainPools(): Record<string, CurvePoolConfig> {
    const pools = CURVE_POOLS[this.chain];
    if (!pools) {
      throw new Error(
        `Curve not supported on ${this.chain}. Available: ${Object.keys(CURVE_POOLS).join(", ")}`,
      );
    }

    return pools;
  }

  private resolvePool(tokenIn: string, tokenOut: string): ResolvedPool {
    const upperTokenIn = tokenIn.toUpperCase();
    const upperTokenOut = tokenOut.toUpperCase();

    for (const pool of Object.values(this.getChainPools())) {
      const indexIn = pool.tokens.findIndex(
        (symbol) => symbol.toUpperCase() === upperTokenIn,
      );
      const indexOut = pool.tokens.findIndex(
        (symbol) => symbol.toUpperCase() === upperTokenOut,
      );

      if (indexIn !== -1 && indexOut !== -1 && indexIn !== indexOut) {
        return {
          config: pool,
          indexIn,
          indexOut,
        };
      }
    }

    throw new Error(
      `No supported Curve pool found for ${upperTokenIn}/${upperTokenOut} on ${this.chain}`,
    );
  }

  private isNativeToken(address: string): boolean {
    return address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
  }

  async quote(
    tokenIn: string,
    tokenOut: string,
    amountIn: number,
  ): Promise<CurveQuote> {
    const pool = this.resolvePool(tokenIn, tokenOut);
    const publicClient = getPublicClient(this.chain);
    const amountInRaw = parseUnits(
      String(amountIn),
      pool.config.decimals[pool.indexIn],
    );
    const amountOutRaw = (await publicClient.readContract({
      address: pool.config.address,
      abi: CURVE_POOL_ABI,
      functionName: "get_dy",
      args: [BigInt(pool.indexIn), BigInt(pool.indexOut), amountInRaw],
    })) as bigint;
    const amountOut = Number(
      formatUnits(amountOutRaw, pool.config.decimals[pool.indexOut]),
    );

    return {
      amountOut: amountOut.toFixed(amountOut > 1 ? 6 : 8),
      pool: pool.config.name,
      price: amountOut / amountIn,
    };
  }

  async swap(
    tokenIn: string,
    tokenOut: string,
    amountIn: number,
    slippage = 0.3,
  ): Promise<CurveSwapResult> {
    if (!this.signer) throw new Error("Signer required for swap");
    const pool = this.resolvePool(tokenIn, tokenOut);
    const publicClient = getPublicClient(this.chain);
    const txGateway = new TxGateway(this.chain, publicClient, this.signer, {
      group: "dex",
      protocol: "curve",
      command: "swap",
    });
    const amountInRaw = parseUnits(
      String(amountIn),
      pool.config.decimals[pool.indexIn],
    );
    const quote = await this.quote(tokenIn, tokenOut, amountIn);
    const amountOutRaw = parseUnits(
      quote.amountOut,
      pool.config.decimals[pool.indexOut],
    );
    const slippageBps = BigInt(Math.round(slippage * 100));
    const effectiveSlippageBps =
      slippageBps > 0n ? slippageBps : DEFAULT_SLIPPAGE_BPS;
    const minAmountOut =
      (amountOutRaw * (10000n - effectiveSlippageBps)) / 10000n;

    const tokenInAddress = pool.config.tokenAddresses[pool.indexIn];
    if (!this.isNativeToken(tokenInAddress)) {
      await txGateway.ensureAllowance(
        tokenInAddress,
        pool.config.address,
        amountInRaw,
        ERC20_ABI,
      );
    }

    const { receipt, txHash } = await txGateway.simulateAndWriteContract({
      address: pool.config.address,
      abi: CURVE_POOL_ABI,
      functionName: "exchange",
      args: [
        BigInt(pool.indexIn),
        BigInt(pool.indexOut),
        amountInRaw,
        minAmountOut,
      ],
      value: this.isNativeToken(tokenInAddress) ? amountInRaw : undefined,
    });

    return {
      txHash,
      tokenIn: tokenIn.toUpperCase(),
      tokenOut: tokenOut.toUpperCase(),
      amountIn: amountIn.toString(),
      amountOut: quote.amountOut,
      pool: pool.config.name,
      status: receipt.status === "success" ? "confirmed" : "failed",
    };
  }

  async pools(): Promise<CurvePool[]> {
    return Object.values(this.getChainPools()).map((pool) => ({
      name: pool.name,
      address: pool.address,
      tokens: pool.tokens,
    }));
  }
}
