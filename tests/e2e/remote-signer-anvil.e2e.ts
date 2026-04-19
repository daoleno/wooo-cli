import { describe, expect, test } from "bun:test";
import type { HttpSignerMetadata } from "../../src/core/signer-protocol";
import { HttpSignerHarness } from "../fixtures/http-signer-harness";
import { selectEthereumAaveBorrowPlan } from "./aave-borrow-plan";
import {
  ETHEREUM_USDC_ADDRESS,
  EthereumAnvilHarness,
  PolygonAnvilHarness,
} from "./anvil-harness";

const AAVE_ETHEREUM_MARKET = "AaveV3Ethereum";
const AUTH_ENV = "WOOO_SIGNER_AUTH_TOKEN";
const AUTH_TOKEN = "anvil-remote-signer-token";
const MORPHO_ETHEREUM_WSTETH_USDC_MARKET =
  "0xb323495f7e4148be5643a4ea4a8221eef163e4bccfdedc2a6f4696baacbc86cc";

interface WalletDiscoverOutput extends HttpSignerMetadata {
  authEnv?: string;
  signerUrl: string;
}

interface WalletConnectOutput {
  address: string;
  chainFamily: string;
  name: string;
  operations: string[];
  signerUrl: string;
}

interface WalletListOutputRow {
  active: boolean;
  address: string;
  chain: string;
  name: string;
  source: string;
}

interface UniswapSwapOutput {
  amountIn: string;
  amountOut: string;
  status: string;
  tokenIn: string;
  tokenOut: string;
  txHash: string;
}

interface ChainBalanceOutput {
  address: string;
  balance: string;
  chain: string;
  token: string;
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

interface AaveMarketOutput {
  active: boolean;
  borrowingEnabled: boolean;
  frozen: boolean;
  token: string;
}

interface MorphoTransactionOutput {
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

interface ApprovalSetOutput {
  chain: string;
  results: Array<{
    contract: string;
    txHash: string;
    type: "erc20" | "erc1155";
  }>;
}

describe("remote signer anvil e2e", () => {
  test(
    "connects a remote signer and executes Uniswap, Aave, and Morpho flows on an Ethereum fork",
    async () => {
      const anvil = new EthereumAnvilHarness();
      await anvil.start();
      const signer = new HttpSignerHarness({
        privateKey: anvil.privateKey as `0x${string}`,
        address: anvil.address,
        authToken: AUTH_TOKEN,
        rpcUrl: anvil.rpcUrl,
      });
      await signer.start();

      try {
        const env = {
          [AUTH_ENV]: AUTH_TOKEN,
        };
        const discover = await anvil.runJson<WalletDiscoverOutput>(
          [
            "wallet",
            "discover",
            "--signer",
            signer.url,
            "--auth-env",
            AUTH_ENV,
          ],
          { env },
        );
        expect(discover.kind).toBe("wooo-wallet-transport");
        expect(discover.transport).toBe("http-signer");
        expect(discover.authEnv).toBe(AUTH_ENV);
        expect(discover.accounts).toEqual([
          {
            address: anvil.address,
            chainFamily: "evm",
            operations: [
              "sign-typed-data",
              "sign-and-send-transaction",
              "sign-protocol-payload",
            ],
          },
        ]);

        const connect = await anvil.runJson<WalletConnectOutput>(
          [
            "wallet",
            "connect",
            "remote-anvil",
            "--signer",
            signer.url,
            "--auth-env",
            AUTH_ENV,
          ],
          { env },
        );
        expect(connect).toEqual({
          name: "remote-anvil",
          address: anvil.address,
          chainFamily: "evm",
          operations: [
            "sign-typed-data",
            "sign-and-send-transaction",
            "sign-protocol-payload",
          ],
          signerUrl: `${signer.url.replace(/\/$/, "")}/`,
        });

        await anvil.runCli(["wallet", "switch", "remote-anvil"], { env });

        const wallets = await anvil.runJson<WalletListOutputRow[]>(
          ["wallet", "list"],
          { env },
        );
        expect(wallets.some((wallet) => wallet.name === "remote-anvil")).toBe(
          true,
        );
        expect(
          wallets.some(
            (wallet) =>
              wallet.name === "remote-anvil" &&
              wallet.source === "remote" &&
              wallet.active === true,
          ),
        ).toBe(true);
        const markets = await anvil.runJson<{
          chain: string;
          markets: AaveMarketOutput[];
        }>(
          [
            "lend",
            "aave",
            "markets",
            "--chain",
            "ethereum",
            "--market",
            AAVE_ETHEREUM_MARKET,
          ],
          { env },
        );
        const borrowPlan = selectEthereumAaveBorrowPlan(
          markets.markets,
          "remote-signer",
        );

        const swap = await anvil.runJson<UniswapSwapOutput>(
          [
            "dex",
            "uniswap",
            "swap",
            "ETH",
            "USDC",
            "0.1",
            "--chain",
            "ethereum",
            "--yes",
          ],
          { env },
        );
        expect(swap.tokenIn).toBe("ETH");
        expect(swap.tokenOut).toBe("USDC");
        expect(swap.status).toBe("confirmed");
        expect(swap.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);

        const usdcBalance = await anvil.runJson<ChainBalanceOutput>(
          [
            "chain",
            "balance",
            anvil.address,
            "--chain",
            "ethereum",
            "--token",
            ETHEREUM_USDC_ADDRESS,
          ],
          { env },
        );
        expect(usdcBalance.token).toBe("USDC");
        expect(Number(usdcBalance.balance)).toBeGreaterThan(100);

        const supply = await anvil.runJson<AaveTransactionOutput>(
          [
            "lend",
            "aave",
            "supply",
            "USDC",
            "100",
            "--chain",
            "ethereum",
            "--market",
            AAVE_ETHEREUM_MARKET,
            "--yes",
          ],
          { env },
        );
        expect(supply.token).toBe("USDC");
        expect(supply.amount).toBe("100");
        expect(supply.status).toBe("confirmed");
        expect(supply.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);

        const positionsAfterSupply = await anvil.runJson<AavePositionsOutput>(
          [
            "lend",
            "aave",
            "positions",
            "--chain",
            "ethereum",
            "--market",
            AAVE_ETHEREUM_MARKET,
          ],
          { env },
        );
        expect(Number(positionsAfterSupply.totalCollateralUSD)).toBeGreaterThan(
          50,
        );
        expect(positionsAfterSupply.totalDebtUSD).toBe("0");
        expect(positionsAfterSupply.healthFactor).toBe("∞");

        const borrow = await anvil.runJson<AaveTransactionOutput>(
          [
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
          ],
          { env },
        );
        expect(borrow.token).toBe(borrowPlan.token);
        expect(borrow.amount).toBe(borrowPlan.borrowAmount);
        expect(borrow.interestRateMode).toBe("variable");
        expect(borrow.status).toBe("confirmed");
        expect(borrow.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);

        const positionsAfterBorrow = await anvil.runJson<AavePositionsOutput>(
          [
            "lend",
            "aave",
            "positions",
            "--chain",
            "ethereum",
            "--market",
            AAVE_ETHEREUM_MARKET,
          ],
          { env },
        );
        expect(Number(positionsAfterBorrow.totalDebtUSD)).toBeGreaterThan(0);
        expect(Number(positionsAfterBorrow.healthFactor)).toBeGreaterThan(1);

        const repay = await anvil.runJson<AaveTransactionOutput>(
          [
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
          ],
          { env },
        );
        expect(repay.token).toBe(borrowPlan.token);
        expect(repay.amount).toBe(borrowPlan.repayAmount);
        expect(repay.interestRateMode).toBe("variable");
        expect(repay.status).toBe("confirmed");
        expect(repay.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);

        const positionsAfterRepay = await anvil.runJson<AavePositionsOutput>(
          [
            "lend",
            "aave",
            "positions",
            "--chain",
            "ethereum",
            "--market",
            AAVE_ETHEREUM_MARKET,
          ],
          { env },
        );
        expect(Number(positionsAfterRepay.totalDebtUSD)).toBeLessThanOrEqual(
          Number(positionsAfterBorrow.totalDebtUSD),
        );

        const morphoSupply = await anvil.runJson<MorphoTransactionOutput>(
          [
            "lend",
            "morpho",
            "supply",
            MORPHO_ETHEREUM_WSTETH_USDC_MARKET,
            "50",
            "--chain",
            "ethereum",
            "--yes",
          ],
          { env },
        );
        expect(morphoSupply.command).toBe("supply");
        expect(morphoSupply.marketId).toBe(MORPHO_ETHEREUM_WSTETH_USDC_MARKET);
        expect(morphoSupply.token).toBe("USDC");
        expect(morphoSupply.status).toBe("confirmed");
        expect(morphoSupply.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);

        const morphoWithdraw = await anvil.runJson<MorphoTransactionOutput>(
          [
            "lend",
            "morpho",
            "withdraw",
            MORPHO_ETHEREUM_WSTETH_USDC_MARKET,
            "25",
            "--chain",
            "ethereum",
            "--yes",
          ],
          { env },
        );
        expect(morphoWithdraw.command).toBe("withdraw");
        expect(morphoWithdraw.marketId).toBe(
          MORPHO_ETHEREUM_WSTETH_USDC_MARKET,
        );
        expect(morphoWithdraw.token).toBe("USDC");
        expect(morphoWithdraw.status).toBe("confirmed");
        expect(morphoWithdraw.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);

        const signerOperations = signer.requests.map(
          (request) => request.operation,
        );
        expect(
          signerOperations.filter(
            (operation) => operation === "sign-and-send-transaction",
          ).length,
        ).toBeGreaterThanOrEqual(9);
      } finally {
        await signer.stop();
        await anvil.stop();
      }
    },
    { timeout: 180_000 },
  );

  test(
    "connects a remote signer and sets Polymarket approvals on a Polygon fork",
    async () => {
      const anvil = new PolygonAnvilHarness();
      await anvil.start();
      const signer = new HttpSignerHarness({
        privateKey: anvil.privateKey as `0x${string}`,
        address: anvil.address,
        authToken: AUTH_TOKEN,
        rpcUrl: anvil.rpcUrl,
      });
      await signer.start();

      try {
        const env = {
          [AUTH_ENV]: AUTH_TOKEN,
        };
        await anvil.runJson<WalletConnectOutput>(
          [
            "wallet",
            "connect",
            "remote-polygon-anvil",
            "--signer",
            signer.url,
            "--auth-env",
            AUTH_ENV,
          ],
          { env },
        );
        await anvil.runCli(["wallet", "switch", "remote-polygon-anvil"], {
          env,
        });

        const approvalSet = await anvil.runJson<ApprovalSetOutput>(
          ["prediction", "polymarket", "approve", "set", "--yes"],
          { env },
        );
        expect(approvalSet.chain).toBe("polygon");
        expect(approvalSet.results.length).toBeGreaterThanOrEqual(4);
        expect(
          approvalSet.results.every(
            (result) =>
              result.contract.length > 0 &&
              /^0x[0-9a-fA-F]{64}$/.test(result.txHash),
          ),
        ).toBe(true);

        const signerOperations = signer.requests.map(
          (request) => request.operation,
        );
        expect(
          signerOperations.every(
            (operation) => operation === "sign-and-send-transaction",
          ),
        ).toBe(true);
        expect(signerOperations.length).toBeGreaterThanOrEqual(4);
      } finally {
        await signer.stop();
        await anvil.stop();
      }
    },
    { timeout: 180_000 },
  );
});
