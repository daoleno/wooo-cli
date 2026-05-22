import { describe, expect, test } from "bun:test";
import { selectEthereumAaveBorrowPlan } from "./aave-borrow-plan";
import {
  ETHEREUM_USDC_ADDRESS,
  ETHEREUM_USDT_ADDRESS,
  EthereumAnvilHarness,
} from "./anvil-harness";

const AAVE_ETHEREUM_MARKET = "AaveV3Ethereum";
const ANVIL_RECIPIENT = "0x1111111111111111111111111111111111111111";
const MORPHO_ETHEREUM_WSTETH_USDC_MARKET =
  "0xb323495f7e4148be5643a4ea4a8221eef163e4bccfdedc2a6f4696baacbc86cc";
const UNISWAP_ROUTER_ETHEREUM = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";

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

interface AggregatedSwapOutput {
  amountIn: string;
  amountOut: string;
  bestRoute: string;
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
  market: string;
  marketAddress: string;
  stableBorrowAPY: string;
  supplyAPY: string;
  token: string;
  variableBorrowAPY: string;
}

interface AaveMarketOutput {
  active: boolean;
  borrowingEnabled: boolean;
  collateralEnabled: boolean;
  decimals: number;
  frozen: boolean;
  ltv: string;
  market: string;
  marketAddress: string;
  stableBorrowAPY: string;
  stableBorrowEnabled: boolean;
  supplyAPY: string;
  token: string;
  tokenAddress: string;
  variableBorrowAPY: string;
}

interface AaveTransactionOutput {
  all?: boolean;
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

interface ChainTransferOutput {
  amount: string;
  chain: string;
  from: string;
  status: string;
  to: string;
  token: string;
  tokenAddress?: string;
  txHash: string;
}

interface ChainApproveOutput {
  amount: string;
  chain: string;
  owner: string;
  spender: string;
  status: string;
  token: string;
  tokenAddress: string;
  txHash: string;
}

interface MorphoSupplyOutput {
  all?: boolean;
  amount: string;
  chain: string;
  command: string;
  marketId: string;
  mode?: string;
  status: string;
  token: string;
  txHash: string;
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

        const recipientNativeBalanceBefore =
          await harness.runJson<ChainBalanceOutput>([
            "chain",
            "balance",
            ANVIL_RECIPIENT,
            "--chain",
            "ethereum",
          ]);

        const nativeTransfer = await harness.runJson<ChainTransferOutput>([
          "chain",
          "transfer",
          ANVIL_RECIPIENT,
          "0.5",
          "--chain",
          "ethereum",
          "--yes",
        ]);
        expect(nativeTransfer.token).toBe("ETH");
        expect(nativeTransfer.amount).toBe("0.5");
        expect(nativeTransfer.to).toBe(ANVIL_RECIPIENT);
        expect(nativeTransfer.status).toBe("confirmed");
        expect(nativeTransfer.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);

        const recipientNativeBalance =
          await harness.runJson<ChainBalanceOutput>([
            "chain",
            "balance",
            ANVIL_RECIPIENT,
            "--chain",
            "ethereum",
          ]);
        expect(recipientNativeBalance.token).toBe("ETH");
        expect(Number(recipientNativeBalance.balance)).toBeGreaterThan(
          Number(recipientNativeBalanceBefore.balance),
        );

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

        const recipientUsdcBalanceBefore =
          await harness.runJson<ChainBalanceOutput>([
            "chain",
            "balance",
            ANVIL_RECIPIENT,
            "--chain",
            "ethereum",
            "--token",
            ETHEREUM_USDC_ADDRESS,
          ]);

        const tokenTransfer = await harness.runJson<ChainTransferOutput>([
          "chain",
          "transfer",
          ANVIL_RECIPIENT,
          "10",
          "--chain",
          "ethereum",
          "--token",
          "USDC",
          "--yes",
        ]);
        expect(tokenTransfer.token).toBe("USDC");
        expect(tokenTransfer.amount).toBe("10");
        expect(tokenTransfer.to).toBe(ANVIL_RECIPIENT);
        expect(tokenTransfer.status).toBe("confirmed");
        expect(tokenTransfer.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);

        const recipientUsdcBalance = await harness.runJson<ChainBalanceOutput>([
          "chain",
          "balance",
          ANVIL_RECIPIENT,
          "--chain",
          "ethereum",
          "--token",
          ETHEREUM_USDC_ADDRESS,
        ]);
        expect(recipientUsdcBalance.token).toBe("USDC");
        expect(Number(recipientUsdcBalance.balance)).toBeGreaterThan(
          Number(recipientUsdcBalanceBefore.balance),
        );

        const explicitApprove = await harness.runJson<ChainApproveOutput>([
          "chain",
          "approve",
          "USDC",
          UNISWAP_ROUTER_ETHEREUM,
          "25",
          "--chain",
          "ethereum",
          "--yes",
        ]);
        expect(explicitApprove.token).toBe("USDC");
        expect(explicitApprove.amount).toBe("25");
        expect(explicitApprove.spender).toBe(UNISWAP_ROUTER_ETHEREUM);
        expect(explicitApprove.status).toBe("confirmed");
        expect(explicitApprove.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);

        const allowance = await harness.runJson<ChainCallOutput>([
          "chain",
          "call",
          ETHEREUM_USDC_ADDRESS,
          "allowance(address,address)(uint256)",
          `${harness.address},${UNISWAP_ROUTER_ETHEREUM}`,
          "--chain",
          "ethereum",
        ]);
        expect(allowance.function).toBe("allowance");
        expect(BigInt(allowance.result)).toBe(25_000_000n);

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

        const aggregatedSwap = await harness.runJson<AggregatedSwapOutput>([
          "swap",
          "USDC",
          "USDT",
          "50",
          "--chain",
          "ethereum",
          "--yes",
        ]);
        expect(aggregatedSwap.tokenIn).toBe("USDC");
        expect(aggregatedSwap.tokenOut).toBe("USDT");
        expect(aggregatedSwap.status).toBe("confirmed");
        expect(["curve", "uniswap"]).toContain(aggregatedSwap.bestRoute);
        expect(aggregatedSwap.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);

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
        expect(rates.market).toBe(AAVE_ETHEREUM_MARKET);
        expect(rates.marketAddress.toLowerCase()).toBe(
          "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2",
        );
        expect(rates.token).toBe("USDC");
        expect(rates.supplyAPY).toContain("%");
        expect(rates.variableBorrowAPY).toContain("%");

        const markets = await harness.runJson<{
          chain: string;
          markets: AaveMarketOutput[];
        }>([
          "lend",
          "aave",
          "markets",
          "--chain",
          "ethereum",
          "--market",
          AAVE_ETHEREUM_MARKET,
        ]);
        expect(markets.chain).toBe("ethereum");
        const usdcMarket = markets.markets.find(
          (item) => item.token === "USDC",
        );
        expect(usdcMarket).toBeDefined();
        expect(usdcMarket?.market).toBe(AAVE_ETHEREUM_MARKET);
        expect(usdcMarket?.marketAddress.toLowerCase()).toBe(
          "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2",
        );
        expect(usdcMarket?.tokenAddress.toLowerCase()).toBe(
          ETHEREUM_USDC_ADDRESS.toLowerCase(),
        );
        const borrowPlan = selectEthereumAaveBorrowPlan(
          markets.markets,
          "fork",
        );

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
          borrowPlan.token,
          borrowPlan.borrowAmount,
          "--chain",
          "ethereum",
          "--market",
          AAVE_ETHEREUM_MARKET,
          "--yes",
        ]);
        expect(borrow.token).toBe(borrowPlan.token);
        expect(borrow.amount).toBe(borrowPlan.borrowAmount);
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

        const repay = await harness.runJson<AaveTransactionOutput>([
          "lend",
          "aave",
          "repay",
          borrowPlan.token,
          borrowPlan.repayAmount,
          "--chain",
          "ethereum",
          "--market",
          AAVE_ETHEREUM_MARKET,
          "--yes",
        ]);
        expect(repay.token).toBe(borrowPlan.token);
        expect(repay.amount).toBe(borrowPlan.repayAmount);
        expect(repay.interestRateMode).toBe("variable");
        expect(repay.status).toBe("confirmed");
        expect(repay.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);

        const positionsAfterRepay = await harness.runJson<AavePositionsOutput>([
          "lend",
          "aave",
          "positions",
          "--chain",
          "ethereum",
          "--market",
          AAVE_ETHEREUM_MARKET,
        ]);
        expect(Number(positionsAfterRepay.totalDebtUSD)).toBeLessThan(
          Number(positionsAfterBorrow.totalDebtUSD),
        );

        const withdraw = await harness.runJson<AaveTransactionOutput>([
          "lend",
          "aave",
          "withdraw",
          "USDC",
          "100",
          "--chain",
          "ethereum",
          "--market",
          AAVE_ETHEREUM_MARKET,
          "--yes",
        ]);
        expect(withdraw.token).toBe("USDC");
        expect(withdraw.amount).toBe("100");
        expect(withdraw.status).toBe("confirmed");
        expect(withdraw.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);

        const positionsAfterWithdraw =
          await harness.runJson<AavePositionsOutput>([
            "lend",
            "aave",
            "positions",
            "--chain",
            "ethereum",
            "--market",
            AAVE_ETHEREUM_MARKET,
          ]);
        expect(Number(positionsAfterWithdraw.totalCollateralUSD)).toBeLessThan(
          Number(positionsAfterRepay.totalCollateralUSD),
        );

        const morphoSupply = await harness.runJson<MorphoSupplyOutput>([
          "lend",
          "morpho",
          "supply",
          MORPHO_ETHEREUM_WSTETH_USDC_MARKET,
          "100",
          "--chain",
          "ethereum",
          "--yes",
        ]);
        expect(morphoSupply.command).toBe("supply");
        expect(morphoSupply.marketId).toBe(MORPHO_ETHEREUM_WSTETH_USDC_MARKET);
        expect(morphoSupply.token).toBe("USDC");
        expect(morphoSupply.status).toBe("confirmed");
        expect(morphoSupply.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);

        const morphoWithdraw = await harness.runJson<MorphoSupplyOutput>([
          "lend",
          "morpho",
          "withdraw",
          MORPHO_ETHEREUM_WSTETH_USDC_MARKET,
          "50",
          "--chain",
          "ethereum",
          "--yes",
        ]);
        expect(morphoWithdraw.command).toBe("withdraw");
        expect(morphoWithdraw.marketId).toBe(
          MORPHO_ETHEREUM_WSTETH_USDC_MARKET,
        );
        expect(morphoWithdraw.token).toBe("USDC");
        expect(morphoWithdraw.status).toBe("confirmed");
        expect(morphoWithdraw.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
      } finally {
        await harness.stop();
      }
    },
    { timeout: 180_000 },
  );
});
