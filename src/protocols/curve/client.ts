import curve from "@curvefi/api";
import { CHAIN_MAP } from "../../core/evm";
import type { CurvePool, CurveSwapResult } from "./types";

interface CurveRouteStep {
  poolAddress?: string;
  poolId?: string;
}

interface CurvePoolEntry {
  address: string;
  coins?: string[];
  id?: string;
  name?: string;
}

const CHAIN_ID_MAP: Record<string, number> = {
  ethereum: 1,
  arbitrum: 42161,
  optimism: 10,
  polygon: 137,
  base: 8453,
};

export class CurveClient {
  private chain: string;
  private initialized = false;

  constructor(
    chain = "ethereum",
    private privateKey?: string,
  ) {
    this.chain = chain;
  }

  private async init() {
    if (this.initialized) return;

    const chainId = CHAIN_ID_MAP[this.chain];
    if (!chainId) {
      throw new Error(
        `Curve not supported on ${this.chain}. Available: ${Object.keys(CHAIN_ID_MAP).join(", ")}`,
      );
    }

    // Get RPC URL from viem chain config
    const viemChain = CHAIN_MAP[this.chain];
    const rpcUrl = viemChain?.rpcUrls?.default?.http?.[0];

    if (this.privateKey) {
      await curve.init(
        "JsonRpc",
        { url: rpcUrl, privateKey: this.privateKey },
        { chainId },
      );
    } else {
      await curve.init("JsonRpc", { url: rpcUrl }, { chainId });
    }

    this.initialized = true;
  }

  async quote(
    tokenIn: string,
    tokenOut: string,
    amountIn: number,
  ): Promise<{ amountOut: string; pool: string; price: number }> {
    await this.init();

    const { route, output } = (await curve.router.getBestRouteAndOutput(
      tokenIn.toUpperCase(),
      tokenOut.toUpperCase(),
      String(amountIn),
    )) as { output: string; route: CurveRouteStep[] };

    const amountOut = Number(output);
    const routeName =
      route
        .map((step) => step.poolId || step.poolAddress || "unknown")
        .join(" → ") || "direct";

    return {
      amountOut: amountOut.toFixed(amountOut > 1 ? 6 : 8),
      pool: routeName,
      price: amountOut / amountIn,
    };
  }

  async swap(
    tokenIn: string,
    tokenOut: string,
    amountIn: number,
    slippage = 0.3,
  ): Promise<CurveSwapResult> {
    if (!this.privateKey) throw new Error("Private key required for swap");

    await this.init();

    const tx = await curve.router.swap(
      tokenIn.toUpperCase(),
      tokenOut.toUpperCase(),
      String(amountIn),
      slippage,
    );

    const txHash = tx.hash;
    const receipt = await tx.wait();

    // Get expected output for result display
    const { output } = await curve.router.getBestRouteAndOutput(
      tokenIn.toUpperCase(),
      tokenOut.toUpperCase(),
      String(amountIn),
    );

    return {
      txHash,
      tokenIn: tokenIn.toUpperCase(),
      tokenOut: tokenOut.toUpperCase(),
      amountIn: amountIn.toString(),
      amountOut: output,
      pool: "curve-router",
      status: receipt?.status === 1 ? "confirmed" : "failed",
    };
  }

  async pools(): Promise<CurvePool[]> {
    await this.init();

    const poolList = (await curve.factory.fetchPools()) as unknown;

    const pools = Array.isArray(poolList) ? (poolList as CurvePoolEntry[]) : [];
    return pools.slice(0, 50).map((pool) => ({
      name: pool.name || pool.id || pool.address,
      address: pool.address,
      tokens: pool.coins || [],
    }));
  }
}
