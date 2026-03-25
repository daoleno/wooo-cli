import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { CliHarness } from "../fixtures/cli-harness";
import {
  JupiterApiHarness,
  SolanaRpcHarness,
} from "../fixtures/jupiter-harness";
import { SolanaSignerHarness } from "../fixtures/solana-signer-harness";

const AUTH_ENV = "WOOO_SIGNER_AUTH_JUPITER_TEST";
const AUTH_TOKEN = "jupiter-local-test-token";
const SOLANA_ADDRESS = "9xQeWvG816bUx9EPjHmaT23yvVMfQ4qZQ9fFZQ4T7j4A";

interface JupiterQuoteOutput {
  amountIn: number;
  inputMint: string;
  inAmount: string;
  outAmount: string;
  outputMint: string;
  priceImpact: string;
  routePlan: string;
  tokenIn: string;
  tokenOut: string;
}

interface JupiterSwapOutput {
  amountIn: string;
  amountOut: string;
  status: string;
  tokenIn: string;
  tokenOut: string;
  txHash: string;
}

describe("jupiter local integration", () => {
  let cli: CliHarness;
  let api: JupiterApiHarness;
  let rpc: SolanaRpcHarness;
  let signer: SolanaSignerHarness;

  beforeEach(async () => {
    cli = new CliHarness("wooo-jupiter-local-");
    api = new JupiterApiHarness();
    rpc = new SolanaRpcHarness();
    signer = new SolanaSignerHarness({
      address: SOLANA_ADDRESS,
      authToken: AUTH_TOKEN,
    });

    await Promise.all([api.start(), rpc.start(), signer.start()]);
    rpc.markConfirmed(signer.txHash);
    cli.writeConfig({
      chains: {
        solana: {
          rpc: rpc.url,
        },
      },
    });
  });

  afterEach(async () => {
    await Promise.all([api.stop(), rpc.stop(), signer.stop()]);
    cli.cleanup();
  });

  test("quotes and swaps through a remote Solana signer with local Jupiter services", async () => {
    const env = {
      [AUTH_ENV]: AUTH_TOKEN,
      WOOO_INTERNAL_JUPITER_API_URL: api.url,
      WOOO_SOLANA_CONFIRM_TIMEOUT_MS: "500",
      WOOO_SOLANA_CONFIRM_POLL_INTERVAL_MS: "0",
    };

    await cli.runCli(
      [
        "wallet",
        "connect",
        "remote-solana",
        "--signer",
        signer.url,
        "--auth-env",
        AUTH_ENV,
        "--json",
      ],
      { env },
    );
    await cli.runCli(["wallet", "switch", "remote-solana"], { env });

    const quote = await cli.runJson<JupiterQuoteOutput>(
      ["dex", "jupiter", "quote", "SOL", "USDC", "0.1", "--json"],
      { env },
    );
    expect(quote.tokenIn).toBe("SOL");
    expect(quote.tokenOut).toBe("USDC");
    expect(quote.outAmount).toBe("15.250000");
    expect(quote.routePlan).toBe("Local Jupiter Route");
    expect(quote.priceImpact).toBe("0.1200%");

    const swap = await cli.runJson<JupiterSwapOutput>(
      ["dex", "jupiter", "swap", "SOL", "USDC", "0.1", "--yes", "--json"],
      { env },
    );
    expect(swap).toEqual({
      txHash: signer.txHash,
      tokenIn: "SOL",
      tokenOut: "USDC",
      amountIn: "0.1",
      amountOut: "15.250000",
      status: "confirmed",
    });

    expect(api.quoteRequests).toHaveLength(2);
    expect(api.quoteRequests[0]).toEqual({
      inputMint: "So11111111111111111111111111111111111111112",
      outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      amount: "100000000",
      slippageBps: "50",
    });
    expect(api.swapRequests).toHaveLength(1);
    expect(api.swapRequests[0]).toEqual({
      quoteResponse: {
        outAmount: "15250000",
        priceImpactPct: "0.0012",
        routePlan: [
          {
            swapInfo: {
              label: "Local Jupiter Route",
            },
          },
        ],
      },
      userPublicKey: SOLANA_ADDRESS,
      wrapAndUnwrapSol: true,
    });

    expect(signer.requests).toHaveLength(1);
    expect(signer.requests[0]?.operation).toBe("sign-and-send-transaction");
    expect(signer.requests[0]?.transaction).toEqual({
      format: "solana-versioned-transaction",
      serializedTransactionBase64:
        Buffer.from("local-jupiter-swap").toString("base64"),
    });

    expect(rpc.signatureStatusRequests).toEqual([[signer.txHash]]);
  });
});
