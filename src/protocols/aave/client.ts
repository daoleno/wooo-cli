import { type Address, formatUnits, maxUint256, parseUnits } from "viem";
import { getPublicClient } from "../../core/evm";
import type { WoooSigner } from "../../core/signers";
import { TxGateway } from "../../core/tx-gateway";
import { type AaveApiMarket, fetchAaveMarkets } from "./api";
import { AAVE_POOL_ABI, ERC20_ABI } from "./constants";
import type {
  AaveBorrowResult,
  AaveMarketSummary,
  AavePositionsSummary,
  AaveRate,
  AaveRepayResult,
  AaveSupplyResult,
  AaveWithdrawResult,
} from "./types";

interface AaveMarketSelection {
  market: string;
  marketAddress: Address;
}

interface AaveReserveSelection extends AaveMarketSelection {
  token: string;
  tokenAddress: Address;
  decimals: number;
  reserve: AaveApiMarket["reserves"][number];
}

interface AaveWriteContext {
  account: Address;
  pool: Address;
  publicClient: ReturnType<typeof getPublicClient>;
  token: { address: Address; decimals: number };
  txGateway: TxGateway;
}

function formatApy(value: string | number | undefined): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "N/A";
  return `${numeric.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function formatPercent(value: string | number | undefined): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "N/A";
  return `${numeric.toLocaleString("en-US", {
    minimumFractionDigits: numeric === 0 ? 0 : 0,
    maximumFractionDigits: 2,
  })}%`;
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

export class AaveClient {
  private marketsPromise?: Promise<AaveApiMarket[]>;

  constructor(
    private chain: string,
    private signer?: WoooSigner,
  ) {}

  private async getMarkets(): Promise<AaveApiMarket[]> {
    if (!this.marketsPromise) {
      this.marketsPromise = fetchAaveMarkets(this.chain);
    }

    const markets = await this.marketsPromise;
    if (markets.length === 0) {
      throw new Error(`Aave has no markets on ${this.chain}`);
    }
    return markets;
  }

  private matchMarketSelector(
    market: AaveApiMarket,
    selector: string,
  ): boolean {
    const normalized = selector.trim().toLowerCase();
    return (
      market.name.toLowerCase() === normalized ||
      market.address.toLowerCase() === normalized
    );
  }

  private formatMarketList(markets: AaveApiMarket[]): string {
    return markets.map((market) => market.name).join(", ");
  }

  private async requireMarket(selector: string): Promise<AaveApiMarket> {
    const markets = await this.getMarkets();
    const market = markets.find((item) =>
      this.matchMarketSelector(item, selector),
    );
    if (!market) {
      throw new Error(
        `Unknown Aave market "${selector}" on ${this.chain}. Available: ${this.formatMarketList(markets)}`,
      );
    }
    return market;
  }

  async resolveMarketSelection(
    marketSelector?: string,
  ): Promise<AaveMarketSelection> {
    const markets = await this.getMarkets();

    if (marketSelector) {
      const market = await this.requireMarket(marketSelector);
      return {
        market: market.name,
        marketAddress: market.address,
      };
    }

    if (markets.length === 1) {
      return {
        market: markets[0].name,
        marketAddress: markets[0].address,
      };
    }

    throw new Error(
      `Aave has multiple markets on ${this.chain}. Specify --market. Available: ${this.formatMarketList(markets)}`,
    );
  }

  async resolveReserveSelection(
    tokenSymbol: string,
    marketSelector?: string,
  ): Promise<Omit<AaveReserveSelection, "reserve">> {
    const selection = await this.findReserveSelection(
      tokenSymbol,
      marketSelector,
    );
    return {
      market: selection.market,
      marketAddress: selection.marketAddress,
      token: selection.token,
      tokenAddress: selection.tokenAddress,
      decimals: selection.decimals,
    };
  }

  private async findReserveSelection(
    tokenSymbol: string,
    marketSelector?: string,
  ): Promise<AaveReserveSelection> {
    const normalizedToken = normalizeSymbol(tokenSymbol);
    const markets = await this.getMarkets();

    if (marketSelector) {
      const market = await this.requireMarket(marketSelector);
      const reserve = market.reserves.find(
        (item) =>
          normalizeSymbol(item.underlyingToken.symbol) === normalizedToken,
      );
      if (!reserve) {
        throw new Error(
          `Token ${normalizedToken} is not listed in ${market.name} on ${this.chain}`,
        );
      }
      return {
        market: market.name,
        marketAddress: market.address,
        token: normalizedToken,
        tokenAddress: reserve.underlyingToken.address,
        decimals: reserve.underlyingToken.decimals,
        reserve,
      };
    }

    const matches = markets.flatMap((market) => {
      const reserve = market.reserves.find(
        (item) =>
          normalizeSymbol(item.underlyingToken.symbol) === normalizedToken,
      );
      if (!reserve) return [];
      return [
        {
          market: market.name,
          marketAddress: market.address,
          token: normalizedToken,
          tokenAddress: reserve.underlyingToken.address,
          decimals: reserve.underlyingToken.decimals,
          reserve,
        },
      ];
    });

    if (matches.length === 0) {
      throw new Error(`Unknown token: ${normalizedToken} on ${this.chain}`);
    }

    if (matches.length > 1) {
      throw new Error(
        `Token ${normalizedToken} exists in multiple Aave markets on ${this.chain}. Specify --market. Matches: ${matches
          .map((match) => match.market)
          .join(", ")}`,
      );
    }

    return matches[0];
  }

  private async createWriteContext(
    tokenSymbol: string,
    command: "borrow" | "repay" | "supply" | "withdraw",
    marketSelector?: string,
  ): Promise<AaveWriteContext> {
    if (!this.signer) throw new Error("Signer required");

    const selection = await this.findReserveSelection(
      tokenSymbol,
      marketSelector,
    );
    const publicClient = getPublicClient(this.chain);
    const account = this.signer.address as Address;
    const txGateway = new TxGateway(this.chain, publicClient, this.signer, {
      group: "lend",
      protocol: "aave",
      command,
    });

    return {
      account,
      pool: selection.marketAddress,
      publicClient,
      token: {
        address: selection.tokenAddress,
        decimals: selection.decimals,
      },
      txGateway,
    };
  }

  async supply(
    tokenSymbol: string,
    amount: number,
    marketSelector?: string,
  ): Promise<AaveSupplyResult> {
    const { account, pool, token, txGateway } = await this.createWriteContext(
      tokenSymbol,
      "supply",
      marketSelector,
    );
    const amountWei = parseUnits(String(amount), token.decimals);

    await txGateway.ensureAllowance(token.address, pool, amountWei, ERC20_ABI);

    const { receipt, txHash } = await txGateway.simulateAndWriteContract({
      address: pool,
      abi: AAVE_POOL_ABI,
      functionName: "supply",
      args: [token.address, amountWei, account, 0],
    });

    return {
      txHash,
      token: normalizeSymbol(tokenSymbol),
      amount: amount.toString(),
      status: receipt.status === "success" ? "confirmed" : "failed",
    };
  }

  async withdraw(
    tokenSymbol: string,
    amount?: number,
    all = false,
    marketSelector?: string,
  ): Promise<AaveWithdrawResult> {
    const { account, pool, token, txGateway } = await this.createWriteContext(
      tokenSymbol,
      "withdraw",
      marketSelector,
    );

    if (!all && amount === undefined) {
      throw new Error("Withdraw amount is required unless all=true");
    }

    const amountWei =
      all || amount === undefined
        ? maxUint256
        : parseUnits(String(amount), token.decimals);

    const { receipt, txHash } = await txGateway.simulateAndWriteContract({
      address: pool,
      abi: AAVE_POOL_ABI,
      functionName: "withdraw",
      args: [token.address, amountWei, account],
    });

    return {
      txHash,
      token: normalizeSymbol(tokenSymbol),
      amount: all ? "ALL" : String(amount),
      all,
      status: receipt.status === "success" ? "confirmed" : "failed",
    };
  }

  async borrow(
    tokenSymbol: string,
    amount: number,
    marketSelector?: string,
  ): Promise<AaveBorrowResult> {
    const { account, pool, token, txGateway } = await this.createWriteContext(
      tokenSymbol,
      "borrow",
      marketSelector,
    );
    const amountWei = parseUnits(String(amount), token.decimals);

    const { receipt, txHash } = await txGateway.simulateAndWriteContract({
      address: pool,
      abi: AAVE_POOL_ABI,
      functionName: "borrow",
      args: [token.address, amountWei, 2n, 0, account],
    });

    return {
      txHash,
      token: normalizeSymbol(tokenSymbol),
      amount: amount.toString(),
      interestRateMode: "variable",
      status: receipt.status === "success" ? "confirmed" : "failed",
    };
  }

  async repay(
    tokenSymbol: string,
    amount?: number,
    all = false,
    marketSelector?: string,
  ): Promise<AaveRepayResult> {
    const { account, pool, token, txGateway } = await this.createWriteContext(
      tokenSymbol,
      "repay",
      marketSelector,
    );

    if (!all && amount === undefined) {
      throw new Error("Repay amount is required unless all=true");
    }

    const amountWei =
      all || amount === undefined
        ? maxUint256
        : parseUnits(String(amount), token.decimals);

    await txGateway.ensureAllowance(token.address, pool, amountWei, ERC20_ABI);

    const { receipt, txHash } = await txGateway.simulateAndWriteContract({
      address: pool,
      abi: AAVE_POOL_ABI,
      functionName: "repay",
      args: [token.address, amountWei, 2n, account],
    });

    return {
      txHash,
      token: normalizeSymbol(tokenSymbol),
      amount: all ? "ALL" : String(amount),
      all,
      interestRateMode: "variable",
      status: receipt.status === "success" ? "confirmed" : "failed",
    };
  }

  async positions(
    address: string,
    marketSelector?: string,
  ): Promise<AavePositionsSummary> {
    const selection = await this.resolveMarketSelection(marketSelector);
    const publicClient = getPublicClient(this.chain);

    const data = await publicClient.readContract({
      address: selection.marketAddress,
      abi: AAVE_POOL_ABI,
      functionName: "getUserAccountData",
      args: [address as Address],
    });

    const [totalCollateral, totalDebt, availableBorrows, , ltv, healthFactor] =
      data as [bigint, bigint, bigint, bigint, bigint, bigint];

    return {
      market: selection.market,
      marketAddress: selection.marketAddress,
      totalCollateralUSD: formatUnits(totalCollateral, 8),
      totalDebtUSD: formatUnits(totalDebt, 8),
      availableBorrowsUSD: formatUnits(availableBorrows, 8),
      healthFactor: totalDebt === 0n ? "∞" : formatUnits(healthFactor, 18),
      ltv: `${Number(ltv) / 100}%`,
    };
  }

  async rates(tokenSymbol: string, marketSelector?: string): Promise<AaveRate> {
    const selection = await this.findReserveSelection(
      tokenSymbol,
      marketSelector,
    );

    return {
      market: selection.market,
      marketAddress: selection.marketAddress,
      token: selection.token,
      supplyAPY: formatApy(selection.reserve.supplyInfo.apy.formatted),
      variableBorrowAPY: formatApy(
        selection.reserve.borrowInfo?.apy.formatted ?? 0,
      ),
      stableBorrowAPY: "N/A",
    };
  }

  async markets(marketSelector?: string): Promise<AaveMarketSummary[]> {
    const markets = marketSelector
      ? [await this.requireMarket(marketSelector)]
      : await this.getMarkets();

    return markets
      .flatMap((market) =>
        market.reserves.map((reserve) => ({
          market: market.name,
          marketAddress: market.address,
          token: normalizeSymbol(reserve.underlyingToken.symbol),
          tokenAddress: reserve.underlyingToken.address,
          decimals: reserve.underlyingToken.decimals,
          supplyAPY: formatApy(reserve.supplyInfo.apy.formatted),
          variableBorrowAPY: formatApy(reserve.borrowInfo?.apy.formatted ?? 0),
          stableBorrowAPY: "N/A",
          ltv: formatPercent(reserve.supplyInfo.maxLTV.formatted),
          collateralEnabled: reserve.supplyInfo.canBeCollateral,
          borrowingEnabled: reserve.borrowInfo?.borrowingState === "ENABLED",
          stableBorrowEnabled: false,
          active: !reserve.isPaused,
          frozen: reserve.isFrozen,
        })),
      )
      .sort(
        (left, right) =>
          left.market.localeCompare(right.market) ||
          left.token.localeCompare(right.token),
      );
  }
}
