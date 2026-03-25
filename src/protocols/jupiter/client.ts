import type { WalletPort } from "../../core/signers";
import { getSolanaConnection } from "../../core/solana";
import { SolanaGateway } from "../../core/solana-gateway";
import { JUPITER_API, resolveTokenMint } from "./constants";
import type {
  JupiterQuote,
  JupiterQuoteResponseData,
  JupiterSwapResult,
} from "./types";

interface JupiterSwapResponse {
  swapTransaction: string;
}

export interface JupiterClientDeps {
  apiUrl?: string;
  connection?: ReturnType<typeof getSolanaConnection>;
}

export class JupiterClient {
  private readonly connection;
  private readonly apiUrl;

  constructor(
    private signer?: WalletPort,
    deps: JupiterClientDeps = {},
  ) {
    this.connection = deps.connection ?? getSolanaConnection();
    this.apiUrl = deps.apiUrl ?? JUPITER_API;
  }

  async prepareQuote(
    tokenInSymbol: string,
    tokenOutSymbol: string,
    amountIn: number,
  ): Promise<{
    quote: JupiterQuote;
    response: JupiterQuoteResponseData;
  }> {
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

    const response = await fetch(`${this.apiUrl}/quote?${params}`);
    if (!response.ok) {
      throw new Error(`Jupiter quote failed: ${response.statusText}`);
    }

    const data = (await response.json()) as JupiterQuoteResponseData;
    const outAmount = Number(data.outAmount) / 10 ** tokenOut.decimals;

    return {
      quote: {
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
      },
      response: data,
    };
  }

  async quote(
    tokenInSymbol: string,
    tokenOutSymbol: string,
    amountIn: number,
  ): Promise<JupiterQuote> {
    const { quote } = await this.prepareQuote(
      tokenInSymbol,
      tokenOutSymbol,
      amountIn,
    );
    return quote;
  }

  async swap(
    tokenInSymbol: string,
    tokenOutSymbol: string,
    amountIn: number,
    quoteResponse?: JupiterQuoteResponseData,
  ): Promise<JupiterSwapResult> {
    if (!this.signer) throw new Error("Signer required for swap");

    const tokenIn = resolveTokenMint(tokenInSymbol);
    const tokenOut = resolveTokenMint(tokenOutSymbol);
    if (!tokenIn) throw new Error(`Unknown Solana token: ${tokenInSymbol}`);
    if (!tokenOut) throw new Error(`Unknown Solana token: ${tokenOutSymbol}`);

    const quoteData =
      quoteResponse ??
      (await this.prepareQuote(tokenInSymbol, tokenOutSymbol, amountIn))
        .response;

    // 2. Get swap transaction
    const swapResponse = await fetch(`${this.apiUrl}/swap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteResponse: quoteData,
        userPublicKey: this.signer.address,
        wrapAndUnwrapSol: true,
      }),
    });

    if (!swapResponse.ok)
      throw new Error(`Swap failed: ${swapResponse.statusText}`);
    const swapData = (await swapResponse.json()) as JupiterSwapResponse;

    // 3. Sign, submit, and confirm
    const gateway = new SolanaGateway(
      this.connection,
      "mainnet-beta",
      this.signer,
      {
        group: "dex",
        protocol: "jupiter",
        command: "swap",
      },
    );
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
