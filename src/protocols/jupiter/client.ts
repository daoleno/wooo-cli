import type { Connection } from "@solana/web3.js";
import { getSolanaConnection, getSolanaKeypair } from "../../core/solana";
import { SolanaGateway } from "../../core/solana-gateway";
import { JUPITER_API, resolveTokenMint } from "./constants";
import type { JupiterQuote, JupiterSwapResult } from "./types";

interface JupiterRoutePlanStep {
  swapInfo?: {
    label?: string;
  };
}

interface JupiterQuoteResponse {
  outAmount: string;
  priceImpactPct?: string;
  routePlan?: JupiterRoutePlanStep[];
}

interface JupiterSwapResponse {
  swapTransaction: string;
}

export class JupiterClient {
  private connection: Connection;

  constructor(private privateKey?: string) {
    this.connection = getSolanaConnection();
  }

  async quote(
    tokenInSymbol: string,
    tokenOutSymbol: string,
    amountIn: number,
  ): Promise<JupiterQuote> {
    const tokenIn = resolveTokenMint(tokenInSymbol);
    const tokenOut = resolveTokenMint(tokenOutSymbol);
    if (!tokenIn) throw new Error(`Unknown Solana token: ${tokenInSymbol}`);
    if (!tokenOut) throw new Error(`Unknown Solana token: ${tokenOutSymbol}`);

    const amountLamports = Math.round(amountIn * 10 ** tokenIn.decimals);

    const params = new URLSearchParams({
      inputMint: tokenIn.mint,
      outputMint: tokenOut.mint,
      amount: amountLamports.toString(),
      slippageBps: "50", // 0.5%
    });

    const response = await fetch(`${JUPITER_API}/quote?${params}`);
    if (!response.ok) {
      throw new Error(`Jupiter quote failed: ${response.statusText}`);
    }

    const data = (await response.json()) as JupiterQuoteResponse;
    const outAmount = Number(data.outAmount) / 10 ** tokenOut.decimals;

    return {
      inputMint: tokenIn.mint,
      outputMint: tokenOut.mint,
      inAmount: amountIn.toString(),
      outAmount: outAmount.toFixed(
        tokenOut.decimals > 8 ? 8 : tokenOut.decimals,
      ),
      priceImpact: `${(Number(data.priceImpactPct) * 100).toFixed(4)}%`,
      routePlan:
        data.routePlan
          ?.map((route) => route.swapInfo?.label || "unknown")
          .join(" → ") || "direct",
    };
  }

  async swap(
    tokenInSymbol: string,
    tokenOutSymbol: string,
    amountIn: number,
  ): Promise<JupiterSwapResult> {
    if (!this.privateKey) throw new Error("Private key required for swap");

    const keypair = getSolanaKeypair(this.privateKey);
    const tokenIn = resolveTokenMint(tokenInSymbol);
    const tokenOut = resolveTokenMint(tokenOutSymbol);
    if (!tokenIn) throw new Error(`Unknown Solana token: ${tokenInSymbol}`);
    if (!tokenOut) throw new Error(`Unknown Solana token: ${tokenOutSymbol}`);

    const amountLamports = Math.round(amountIn * 10 ** tokenIn.decimals);

    // 1. Get quote
    const quoteParams = new URLSearchParams({
      inputMint: tokenIn.mint,
      outputMint: tokenOut.mint,
      amount: amountLamports.toString(),
      slippageBps: "50",
    });

    const quoteResponse = await fetch(`${JUPITER_API}/quote?${quoteParams}`);
    if (!quoteResponse.ok)
      throw new Error(`Quote failed: ${quoteResponse.statusText}`);
    const quoteData = (await quoteResponse.json()) as JupiterQuoteResponse;

    // 2. Get swap transaction
    const swapResponse = await fetch(`${JUPITER_API}/swap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteResponse: quoteData,
        userPublicKey: keypair.publicKey.toString(),
        wrapAndUnwrapSol: true,
      }),
    });

    if (!swapResponse.ok)
      throw new Error(`Swap failed: ${swapResponse.statusText}`);
    const swapData = (await swapResponse.json()) as JupiterSwapResponse;

    // 3. Sign, submit, and confirm
    const gateway = new SolanaGateway(this.connection, keypair);
    const { txHash } = await gateway.sendVersionedTransaction(
      swapData.swapTransaction,
    );

    const outAmount = Number(quoteData.outAmount) / 10 ** tokenOut.decimals;

    return {
      txHash,
      tokenIn: tokenInSymbol.toUpperCase(),
      tokenOut: tokenOutSymbol.toUpperCase(),
      amountIn: amountIn.toString(),
      amountOut: outAmount.toFixed(
        tokenOut.decimals > 8 ? 8 : tokenOut.decimals,
      ),
      status: "confirmed",
    };
  }

  tokens(): string[] {
    const { SOLANA_TOKENS } = require("./constants");
    return Object.keys(SOLANA_TOKENS);
  }
}
