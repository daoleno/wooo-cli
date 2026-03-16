import { describe, expect, test } from "bun:test";
import {
  ETHEREUM_USDC_ADDRESS,
  ETHEREUM_USDT_ADDRESS,
  EthereumAnvilHarness,
} from "./anvil-harness";

const AAVE_ETHEREUM_MARKET = "AaveV3Ethereum";

interface ChainBalanceOutput {
  address: string;
  balance: string;
  chain: string;
  token: string;
}

interface ChainCallOutput {
  chain: string;
  contract: string;
  function: string;
  result: string;
}

interface UniswapQuoteOutput {
  amountIn: string;
  amountOut: string;
  price: number;
  priceImpact: number;
  route: string;
  tokenIn: string;
  tokenOut: string;
}

interface UniswapSwapOutput {
  amountIn: string;
  amountOut: string;
  status: string;
  tokenIn: string;
  tokenOut: string;
  txHash: string;
}

interface CurveQuoteOutput {
  amountIn: number;
  amountOut: string;
  pool: string;
  price: number;
  tokenIn: string;
  tokenOut: string;
}

interface CurveSwapOutput {
  amountIn: string;
  amountOut: string;
  pool: string;
  status: string;
  tokenIn: string;
  tokenOut: string;
  txHash: string;
}

interface AaveRateOutput {
  stableBorrowAPY: string;
  supplyAPY: string;
  token: string;
  variableBorrowAPY: string;
}

interface AaveTransactionOutput {
  amount: string;
  interestRateMode?: string;
  status: string;
  token: string;
  txHash: string;
}

interface AavePositionsOutput {
  availableBorrowsUSD: string;
  healthFactor: string;
  ltv: string;
  totalCollateralUSD: string;
  totalDebtUSD: string;
}

describe("anvil fork e2e", () => {
  test(
    "runs chain, Uniswap, Curve, and Aave flows against an Ethereum fork",
    async () => {
      const harness = new EthereumAnvilHarness();
      await harness.start();

      try {
        const nativeBalance = await harness.runJson<ChainBalanceOutput>([
          "chain",
          "balance",
          harness.address,
          "--chain",
          "ethereum",
        ]);
        expect(nativeBalance.address).toBe(harness.address);
        expect(nativeBalance.chain).toBe("ethereum");
        expect(nativeBalance.token).toBe("ETH");
        expect(Number(nativeBalance.balance)).toBeGreaterThan(1000);

        const quote = await harness.runJson<UniswapQuoteOutput>([
          "dex",
          "uniswap",
          "quote",
          "ETH",
          "USDC",
          "1",
          "--chain",
          "ethereum",
        ]);
        expect(quote.tokenIn).toBe("ETH");
        expect(quote.tokenOut).toBe("USDC");
        expect(Number(quote.amountOut)).toBeGreaterThan(1000);

        const swap = await harness.runJson<UniswapSwapOutput>([
          "dex",
          "uniswap",
          "swap",
          "ETH",
          "USDC",
          "1",
          "--chain",
          "ethereum",
          "--yes",
        ]);
        expect(swap.tokenIn).toBe("ETH");
        expect(swap.tokenOut).toBe("USDC");
        expect(swap.status).toBe("confirmed");
        expect(swap.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);

        const usdcBalance = await harness.runJson<ChainBalanceOutput>([
          "chain",
          "balance",
          harness.address,
          "--chain",
          "ethereum",
          "--token",
          ETHEREUM_USDC_ADDRESS,
        ]);
        expect(usdcBalance.token).toBe("USDC");
        expect(Number(usdcBalance.balance)).toBeGreaterThan(1000);

        const balanceOf = await harness.runJson<ChainCallOutput>([
          "chain",
          "call",
          ETHEREUM_USDC_ADDRESS,
          "balanceOf(address)(uint256)",
          harness.address,
          "--chain",
          "ethereum",
        ]);
        expect(balanceOf.function).toBe("balanceOf");
        expect(BigInt(balanceOf.result) > 0n).toBe(true);

        const curveQuote = await harness.runJson<CurveQuoteOutput>([
          "dex",
          "curve",
          "quote",
          "USDC",
          "USDT",
          "100",
          "--chain",
          "ethereum",
        ]);
        expect(curveQuote.tokenIn).toBe("USDC");
        expect(curveQuote.tokenOut).toBe("USDT");
        expect(Number(curveQuote.amountOut)).toBeGreaterThan(95);
        expect(curveQuote.pool.length).toBeGreaterThan(0);

        const curveSwap = await harness.runJson<CurveSwapOutput>([
          "dex",
          "curve",
          "swap",
          "USDC",
          "USDT",
          "100",
          "--chain",
          "ethereum",
          "--yes",
        ]);
        expect(curveSwap.tokenIn).toBe("USDC");
        expect(curveSwap.tokenOut).toBe("USDT");
        expect(curveSwap.status).toBe("confirmed");
        expect(curveSwap.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);

        const usdtBalance = await harness.runJson<ChainBalanceOutput>([
          "chain",
          "balance",
          harness.address,
          "--chain",
          "ethereum",
          "--token",
          ETHEREUM_USDT_ADDRESS,
        ]);
        expect(usdtBalance.token).toBe("USDT");
        expect(Number(usdtBalance.balance)).toBeGreaterThan(95);

        const rates = await harness.runJson<AaveRateOutput>([
          "lend",
          "aave",
          "rates",
          "USDC",
          "--chain",
          "ethereum",
          "--market",
          AAVE_ETHEREUM_MARKET,
        ]);
        expect(rates.token).toBe("USDC");
        expect(rates.supplyAPY).toContain("%");
        expect(rates.variableBorrowAPY).toContain("%");

        const supply = await harness.runJson<AaveTransactionOutput>([
          "lend",
          "aave",
          "supply",
          "USDC",
          "1000",
          "--chain",
          "ethereum",
          "--market",
          AAVE_ETHEREUM_MARKET,
          "--yes",
        ]);
        expect(supply.token).toBe("USDC");
        expect(supply.amount).toBe("1000");
        expect(supply.status).toBe("confirmed");
        expect(supply.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);

        const positionsAfterSupply = await harness.runJson<AavePositionsOutput>(
          [
            "lend",
            "aave",
            "positions",
            "--chain",
            "ethereum",
            "--market",
            AAVE_ETHEREUM_MARKET,
          ],
        );
        expect(Number(positionsAfterSupply.totalCollateralUSD)).toBeGreaterThan(
          900,
        );
        expect(positionsAfterSupply.totalDebtUSD).toBe("0");
        expect(positionsAfterSupply.healthFactor).toBe("∞");

        const borrow = await harness.runJson<AaveTransactionOutput>([
          "lend",
          "aave",
          "borrow",
          "WETH",
          "0.01",
          "--chain",
          "ethereum",
          "--market",
          AAVE_ETHEREUM_MARKET,
          "--yes",
        ]);
        expect(borrow.token).toBe("WETH");
        expect(borrow.amount).toBe("0.01");
        expect(borrow.interestRateMode).toBe("variable");
        expect(borrow.status).toBe("confirmed");
        expect(borrow.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);

        const positionsAfterBorrow = await harness.runJson<AavePositionsOutput>(
          [
            "lend",
            "aave",
            "positions",
            "--chain",
            "ethereum",
            "--market",
            AAVE_ETHEREUM_MARKET,
          ],
        );
        expect(Number(positionsAfterBorrow.totalCollateralUSD)).toBeGreaterThan(
          900,
        );
        expect(Number(positionsAfterBorrow.totalDebtUSD)).toBeGreaterThan(1);
        expect(Number(positionsAfterBorrow.healthFactor)).toBeGreaterThan(1);
      } finally {
        await harness.stop();
      }
    },
    { timeout: 120_000 },
  );
});
