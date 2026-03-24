import {
  getChainAddresses,
  type InputMarketParams,
  type MarketId,
} from "@morpho-org/blue-sdk";
import {
  blueAbi,
  fetchAccrualPosition,
  fetchMarket,
  fetchToken,
} from "@morpho-org/blue-sdk-viem";
import {
  type Address,
  formatUnits,
  getAddress,
  type Hex,
  maxUint256,
  parseUnits,
  zeroAddress,
} from "viem";
import { getChain, getPublicClient } from "../../core/evm";
import type { WoooSigner } from "../../core/signers";
import { TxGateway } from "../../core/tx-gateway";
import { ERC20_ABI } from "../uniswap/constants";
import type {
  MorphoMarketDetail,
  MorphoMarketSummary,
  MorphoPositionSummary,
  MorphoPreparedWrite,
  MorphoWriteCommand,
  MorphoWriteResult,
} from "./types";

const MORPHO_BLUE_API_URL = "https://blue-api.morpho.org/graphql";
const EMPTY_DATA = "0x" as Hex;

interface GraphqlResponse<T> {
  data?: T;
  errors?: Array<{ message?: string }>;
}

interface GraphqlMarketsResponse {
  markets?: {
    items?: Array<{
      uniqueKey: string;
      lltv: string;
      loanAsset: { address: string; symbol?: string | null; decimals: number };
      collateralAsset?: {
        address: string;
        symbol?: string | null;
        decimals: number;
      } | null;
      state?: {
        borrowApy: number;
        supplyApy: number;
        totalLiquidity: string;
      } | null;
    }> | null;
  } | null;
}

interface GraphqlMarketPositionsResponse {
  marketPositions?: {
    items?: Array<{
      market: { uniqueKey: string };
    }> | null;
  } | null;
}

interface MorphoTokenInfo {
  address: Address;
  decimals: number;
  symbol?: string | null;
}

interface MorphoMarketContext {
  morphoAddress: Address;
  market: Awaited<ReturnType<typeof fetchMarket>>;
  marketParams: InputMarketParams;
  loanToken: MorphoTokenInfo;
  collateralToken: MorphoTokenInfo;
  loanTokenLabel: string;
  collateralTokenLabel: string;
  marketLabel: string;
  hasCollateral: boolean;
}

function trimDecimals(value: string, maxDecimals = 4): string {
  const [integer, fraction] = value.split(".");
  if (!fraction || maxDecimals <= 0) {
    return integer;
  }

  const trimmedFraction = fraction.slice(0, maxDecimals).replace(/0+$/, "");
  return trimmedFraction ? `${integer}.${trimmedFraction}` : integer;
}

function isZeroAddress(value: string): boolean {
  return value.toLowerCase() === zeroAddress.toLowerCase();
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getTokenLabel(token: {
  address: string;
  symbol?: string | null;
}): string {
  if (isZeroAddress(token.address)) {
    return "NONE";
  }

  const symbol = token.symbol?.trim();
  return symbol && symbol.length > 0 ? symbol : shortAddress(token.address);
}

function formatTokenAmount(
  amount: bigint,
  decimals: number,
  symbol: string,
  maxDecimals = 4,
): string {
  return `${trimDecimals(formatUnits(amount, decimals), maxDecimals)} ${symbol}`;
}

function formatPercent(value: number, maxDecimals = 2): string {
  return `${(value * 100).toFixed(maxDecimals)}%`;
}

function formatWadPercent(value: bigint, maxDecimals = 2): string {
  return `${trimDecimals(formatUnits(value, 16), maxDecimals)}%`;
}

function formatWadRatio(value: bigint, maxDecimals = 2): string {
  return trimDecimals(formatUnits(value, 18), maxDecimals);
}

function formatHealthFactor(
  value: bigint | undefined,
  borrowed: bigint,
): string {
  if (borrowed === 0n || value === maxUint256) {
    return "∞";
  }
  if (value === undefined) {
    return "N/A";
  }
  return formatWadRatio(value, 2);
}

function parseTokenAmount(
  amount: number,
  decimals: number,
  symbol: string,
): bigint {
  const parsed = parseUnits(String(amount), decimals);
  if (parsed <= 0n) {
    throw new Error(`Amount is too small for ${symbol}`);
  }
  return parsed;
}

async function queryMorpho<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(MORPHO_BLUE_API_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Morpho Blue API request failed: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as GraphqlResponse<T>;
  if (payload.errors?.length) {
    throw new Error(
      payload.errors
        .map((error) => error.message || "Unknown Morpho Blue API error")
        .join("; "),
    );
  }
  if (!payload.data) {
    throw new Error("Morpho Blue API returned no data");
  }

  return payload.data;
}

export class MorphoClient {
  constructor(
    private chain: string,
    private signer?: WoooSigner,
  ) {}

  private getChainId(): number {
    return getChain(this.chain).id;
  }

  private getMorphoAddress(): Address {
    return getAddress(getChainAddresses(this.getChainId()).morpho);
  }

  private requireSigner(): WoooSigner {
    if (!this.signer) {
      throw new Error("Signer required");
    }
    return this.signer;
  }

  private async fetchTokenInfo(address: Address): Promise<MorphoTokenInfo> {
    if (isZeroAddress(address)) {
      return {
        address: zeroAddress,
        decimals: 18,
        symbol: "NONE",
      };
    }

    const publicClient = getPublicClient(this.chain);
    const token = await fetchToken(address, publicClient);
    return {
      address: token.address,
      decimals: token.decimals,
      symbol: token.symbol,
    };
  }

  private async getMarketContext(
    marketId: string,
  ): Promise<MorphoMarketContext> {
    const publicClient = getPublicClient(this.chain);
    const market = await fetchMarket(marketId as MarketId, publicClient);
    const loanToken = await this.fetchTokenInfo(
      market.params.loanToken as Address,
    );
    const collateralToken = await this.fetchTokenInfo(
      market.params.collateralToken as Address,
    );
    const loanTokenLabel = getTokenLabel(loanToken);
    const collateralTokenLabel = getTokenLabel(collateralToken);
    const marketParams: InputMarketParams = {
      loanToken: market.params.loanToken,
      collateralToken: market.params.collateralToken,
      oracle: market.params.oracle,
      irm: market.params.irm,
      lltv: market.params.lltv,
    };

    return {
      morphoAddress: this.getMorphoAddress(),
      market,
      marketParams,
      loanToken,
      collateralToken,
      loanTokenLabel,
      collateralTokenLabel,
      marketLabel: `${loanTokenLabel}/${collateralTokenLabel}`,
      hasCollateral: !isZeroAddress(market.params.collateralToken),
    };
  }

  private ensureCollateralMarket(context: MorphoMarketContext): void {
    if (!context.hasCollateral || context.marketParams.lltv === 0n) {
      throw new Error(
        `Market ${context.market.id} does not support collateralized borrowing`,
      );
    }
  }

  private async getWalletPosition(address: string, marketId: string) {
    const publicClient = getPublicClient(this.chain);
    return await fetchAccrualPosition(
      address as Address,
      marketId as MarketId,
      publicClient,
    );
  }

  private createPreparedWrite(options: {
    command: MorphoWriteCommand;
    context: MorphoMarketContext;
    token: MorphoTokenInfo;
    tokenLabel: string;
    assetType: "loan" | "collateral";
    amountWei: bigint;
    shares?: bigint;
    mode: "assets" | "shares";
    all?: boolean;
    requiresApproval?: boolean;
  }): MorphoPreparedWrite {
    return {
      chain: this.chain,
      command: options.command,
      marketId: options.context.market.id,
      marketLabel: options.context.marketLabel,
      morphoAddress: options.context.morphoAddress,
      loanToken: options.context.loanTokenLabel,
      collateralToken: options.context.collateralTokenLabel,
      token: options.tokenLabel,
      tokenAddress: options.token.address,
      tokenDecimals: options.token.decimals,
      assetType: options.assetType,
      amountDisplay: formatTokenAmount(
        options.amountWei,
        options.token.decimals,
        options.tokenLabel,
      ),
      amountWei: options.amountWei,
      shares: options.shares ?? 0n,
      sharesDisplay:
        options.shares === undefined ? null : options.shares.toString(),
      all: options.all ?? false,
      mode: options.mode,
      requiresApproval: options.requiresApproval ?? false,
      marketParams: {
        loanToken: options.context.marketParams.loanToken,
        collateralToken: options.context.marketParams.collateralToken,
        oracle: options.context.marketParams.oracle,
        irm: options.context.marketParams.irm,
        lltv: options.context.marketParams.lltv,
      },
    };
  }

  async markets(filters: {
    search?: string;
    loanToken?: string;
    collateralToken?: string;
    limit: number;
  }): Promise<MorphoMarketSummary[]> {
    const query = `
      query Markets($chainId: Int!, $first: Int!, $search: String) {
        markets(
          first: $first
          orderBy: TotalLiquidityUsd
          orderDirection: Desc
          where: {
            chainId_in: [$chainId]
            whitelisted: true
            search: $search
          }
        ) {
          items {
            uniqueKey
            lltv
            loanAsset {
              address
              symbol
              decimals
            }
            collateralAsset {
              address
              symbol
              decimals
            }
            state {
              borrowApy
              supplyApy
              totalLiquidity
            }
          }
        }
      }
    `;

    const loanToken = filters.loanToken?.trim().toUpperCase();
    const collateralToken = filters.collateralToken?.trim().toUpperCase();
    const result = await queryMorpho<GraphqlMarketsResponse>(query, {
      chainId: this.getChainId(),
      first:
        loanToken || collateralToken || filters.search
          ? Math.max(filters.limit * 5, 25)
          : filters.limit,
      search: filters.search?.trim() || null,
    });

    return (result.markets?.items ?? [])
      .filter((market) => {
        const marketLoanToken = market.loanAsset.symbol?.toUpperCase() ?? "";
        if (loanToken && marketLoanToken !== loanToken) {
          return false;
        }

        const marketCollateralToken =
          market.collateralAsset?.symbol?.toUpperCase() ?? "";
        if (collateralToken && marketCollateralToken !== collateralToken) {
          return false;
        }

        return true;
      })
      .slice(0, filters.limit)
      .map((market) => ({
        chain: this.chain,
        marketId: market.uniqueKey,
        loanToken: getTokenLabel(market.loanAsset),
        collateralToken: market.collateralAsset
          ? getTokenLabel(market.collateralAsset)
          : "NONE",
        borrowAPY: formatPercent(market.state?.borrowApy ?? 0),
        supplyAPY: formatPercent(market.state?.supplyApy ?? 0),
        totalLiquidity: formatTokenAmount(
          BigInt(market.state?.totalLiquidity ?? 0),
          market.loanAsset.decimals,
          getTokenLabel(market.loanAsset),
        ),
        lltv: formatWadPercent(BigInt(market.lltv)),
      }));
  }

  async market(marketId: string): Promise<MorphoMarketDetail> {
    const context = await this.getMarketContext(marketId);

    return {
      chain: this.chain,
      marketId: context.market.id,
      loanToken: context.loanTokenLabel,
      loanTokenAddress: context.loanToken.address,
      collateralToken: context.collateralTokenLabel,
      collateralTokenAddress: context.collateralToken.address,
      oracle: context.market.params.oracle,
      irm: context.market.params.irm,
      borrowAPY: formatPercent(context.market.borrowApy),
      supplyAPY: formatPercent(context.market.supplyApy),
      utilization: formatWadPercent(context.market.utilization),
      totalLiquidity: formatTokenAmount(
        context.market.liquidity,
        context.loanToken.decimals,
        context.loanTokenLabel,
      ),
      totalSupply: formatTokenAmount(
        context.market.totalSupplyAssets,
        context.loanToken.decimals,
        context.loanTokenLabel,
      ),
      totalBorrow: formatTokenAmount(
        context.market.totalBorrowAssets,
        context.loanToken.decimals,
        context.loanTokenLabel,
      ),
      lltv: formatWadPercent(context.market.params.lltv),
      lastUpdate: context.market.lastUpdate.toString(),
    };
  }

  async positions(address: string): Promise<MorphoPositionSummary[]> {
    const query = `
      query MarketPositions($address: String!, $chainId: Int!) {
        marketPositions(
          first: 50
          where: {
            userAddress_in: [$address]
            chainId_in: [$chainId]
          }
        ) {
          items {
            market {
              uniqueKey
            }
          }
        }
      }
    `;

    const result = await queryMorpho<GraphqlMarketPositionsResponse>(query, {
      address: address.toLowerCase(),
      chainId: this.getChainId(),
    });

    const marketIds = [
      ...new Set(
        (result.marketPositions?.items ?? []).map(
          (position) => position.market.uniqueKey,
        ),
      ),
    ];

    if (marketIds.length === 0) {
      return [];
    }

    const publicClient = getPublicClient(this.chain);
    const marketCache = new Map<
      string,
      Awaited<ReturnType<typeof fetchMarket>>
    >();
    const tokenCache = new Map<string, MorphoTokenInfo>();

    const getCachedToken = async (
      address: Address,
    ): Promise<MorphoTokenInfo> => {
      const cacheKey = address.toLowerCase();
      const cached = tokenCache.get(cacheKey);
      if (cached) {
        return cached;
      }

      const token = isZeroAddress(address)
        ? {
            address: zeroAddress,
            decimals: 18,
            symbol: "NONE",
          }
        : await fetchToken(address, publicClient);

      const tokenInfo: MorphoTokenInfo = {
        address: token.address,
        decimals: token.decimals,
        symbol: token.symbol,
      };
      tokenCache.set(cacheKey, tokenInfo);
      return tokenInfo;
    };

    const positions = await Promise.all(
      marketIds.map(async (marketId) => {
        let market = marketCache.get(marketId);
        if (!market) {
          market = await fetchMarket(marketId as MarketId, publicClient);
          marketCache.set(marketId, market);
        }

        const loanToken = await getCachedToken(
          market.params.loanToken as Address,
        );
        const collateralToken = await getCachedToken(
          market.params.collateralToken as Address,
        );
        const position = await fetchAccrualPosition(
          address as Address,
          marketId as MarketId,
          publicClient,
        );

        if (
          position.supplyAssets === 0n &&
          position.borrowAssets === 0n &&
          position.collateral === 0n
        ) {
          return null;
        }

        const loanTokenLabel = getTokenLabel(loanToken);
        const collateralTokenLabel = getTokenLabel(collateralToken);

        return {
          chain: this.chain,
          marketId,
          loanToken: loanTokenLabel,
          collateralToken: collateralTokenLabel,
          supplied: formatTokenAmount(
            position.supplyAssets,
            loanToken.decimals,
            loanTokenLabel,
          ),
          borrowed: formatTokenAmount(
            position.borrowAssets,
            loanToken.decimals,
            loanTokenLabel,
          ),
          collateral: formatTokenAmount(
            position.collateral,
            collateralToken.decimals,
            collateralTokenLabel,
          ),
          maxBorrowable:
            position.maxBorrowableAssets === undefined
              ? "N/A"
              : formatTokenAmount(
                  position.maxBorrowableAssets,
                  loanToken.decimals,
                  loanTokenLabel,
                ),
          healthFactor: formatHealthFactor(
            position.healthFactor,
            position.borrowAssets,
          ),
          healthy:
            position.isHealthy === undefined
              ? null
              : Boolean(position.isHealthy),
        };
      }),
    );

    return positions.filter(
      (position): position is MorphoPositionSummary => position !== null,
    );
  }

  async prepareSupply(
    marketId: string,
    amount: number,
  ): Promise<MorphoPreparedWrite> {
    const context = await this.getMarketContext(marketId);
    const amountWei = parseTokenAmount(
      amount,
      context.loanToken.decimals,
      context.loanTokenLabel,
    );
    const simulated = context.market.supply(amountWei, 0n);

    return this.createPreparedWrite({
      command: "supply",
      context,
      token: context.loanToken,
      tokenLabel: context.loanTokenLabel,
      assetType: "loan",
      amountWei: simulated.assets,
      shares: simulated.shares,
      mode: "assets",
      requiresApproval: true,
    });
  }

  async prepareWithdraw(
    marketId: string,
    amount?: number,
    address?: string,
  ): Promise<MorphoPreparedWrite> {
    const context = await this.getMarketContext(marketId);

    if (address) {
      const position = await this.getWalletPosition(address, marketId);
      if (position.supplyShares === 0n) {
        throw new Error(
          `No supplied ${context.loanTokenLabel} found on this market`,
        );
      }

      const simulated = position.withdraw(0n, position.supplyShares);
      return this.createPreparedWrite({
        command: "withdraw",
        context,
        token: context.loanToken,
        tokenLabel: context.loanTokenLabel,
        assetType: "loan",
        amountWei: simulated.assets,
        shares: simulated.shares,
        mode: "shares",
        all: true,
      });
    }

    if (amount === undefined) {
      throw new Error("Withdraw amount is required unless --all is set");
    }

    const amountWei = parseTokenAmount(
      amount,
      context.loanToken.decimals,
      context.loanTokenLabel,
    );
    const simulated = context.market.withdraw(amountWei, 0n);

    return this.createPreparedWrite({
      command: "withdraw",
      context,
      token: context.loanToken,
      tokenLabel: context.loanTokenLabel,
      assetType: "loan",
      amountWei: simulated.assets,
      shares: simulated.shares,
      mode: "assets",
    });
  }

  async prepareBorrow(
    marketId: string,
    amount: number,
  ): Promise<MorphoPreparedWrite> {
    const context = await this.getMarketContext(marketId);
    this.ensureCollateralMarket(context);

    const amountWei = parseTokenAmount(
      amount,
      context.loanToken.decimals,
      context.loanTokenLabel,
    );
    const simulated = context.market.borrow(amountWei, 0n);

    return this.createPreparedWrite({
      command: "borrow",
      context,
      token: context.loanToken,
      tokenLabel: context.loanTokenLabel,
      assetType: "loan",
      amountWei: simulated.assets,
      shares: simulated.shares,
      mode: "assets",
    });
  }

  async prepareRepay(
    marketId: string,
    amount?: number,
    address?: string,
  ): Promise<MorphoPreparedWrite> {
    const context = await this.getMarketContext(marketId);

    if (address) {
      const position = await this.getWalletPosition(address, marketId);
      if (position.borrowShares === 0n) {
        throw new Error(
          `No borrowed ${context.loanTokenLabel} found on this market`,
        );
      }

      const simulated = position.repay(0n, position.borrowShares);
      return this.createPreparedWrite({
        command: "repay",
        context,
        token: context.loanToken,
        tokenLabel: context.loanTokenLabel,
        assetType: "loan",
        amountWei: simulated.assets,
        shares: simulated.shares,
        mode: "shares",
        all: true,
        requiresApproval: true,
      });
    }

    if (amount === undefined) {
      throw new Error("Repay amount is required unless --all is set");
    }

    const amountWei = parseTokenAmount(
      amount,
      context.loanToken.decimals,
      context.loanTokenLabel,
    );
    const simulated = context.market.repay(amountWei, 0n);

    return this.createPreparedWrite({
      command: "repay",
      context,
      token: context.loanToken,
      tokenLabel: context.loanTokenLabel,
      assetType: "loan",
      amountWei: simulated.assets,
      shares: simulated.shares,
      mode: "assets",
      requiresApproval: true,
    });
  }

  async prepareSupplyCollateral(
    marketId: string,
    amount: number,
  ): Promise<MorphoPreparedWrite> {
    const context = await this.getMarketContext(marketId);
    this.ensureCollateralMarket(context);

    const amountWei = parseTokenAmount(
      amount,
      context.collateralToken.decimals,
      context.collateralTokenLabel,
    );

    return this.createPreparedWrite({
      command: "supply-collateral",
      context,
      token: context.collateralToken,
      tokenLabel: context.collateralTokenLabel,
      assetType: "collateral",
      amountWei,
      mode: "assets",
      requiresApproval: true,
    });
  }

  async prepareWithdrawCollateral(
    marketId: string,
    amount?: number,
    address?: string,
  ): Promise<MorphoPreparedWrite> {
    const context = await this.getMarketContext(marketId);
    this.ensureCollateralMarket(context);

    if (address) {
      const position = await this.getWalletPosition(address, marketId);
      if (position.collateral === 0n) {
        throw new Error(
          `No supplied ${context.collateralTokenLabel} collateral found on this market`,
        );
      }

      return this.createPreparedWrite({
        command: "withdraw-collateral",
        context,
        token: context.collateralToken,
        tokenLabel: context.collateralTokenLabel,
        assetType: "collateral",
        amountWei: position.collateral,
        mode: "assets",
        all: true,
      });
    }

    if (amount === undefined) {
      throw new Error(
        "Collateral withdraw amount is required unless --all is set",
      );
    }

    const amountWei = parseTokenAmount(
      amount,
      context.collateralToken.decimals,
      context.collateralTokenLabel,
    );

    return this.createPreparedWrite({
      command: "withdraw-collateral",
      context,
      token: context.collateralToken,
      tokenLabel: context.collateralTokenLabel,
      assetType: "collateral",
      amountWei,
      mode: "assets",
    });
  }

  async executeWrite(
    prepared: MorphoPreparedWrite,
  ): Promise<MorphoWriteResult> {
    const signer = this.requireSigner();
    const publicClient = getPublicClient(this.chain);
    const account = signer.address;
    const txGateway = new TxGateway(this.chain, publicClient, signer, {
      group: "lend",
      protocol: "morpho",
      command: prepared.command,
    });
    const morphoAddress = getAddress(prepared.morphoAddress);

    if (prepared.requiresApproval && prepared.amountWei > 0n) {
      await txGateway.ensureAllowance(
        getAddress(prepared.tokenAddress),
        morphoAddress,
        prepared.amountWei,
        ERC20_ABI,
      );
    }

    const marketParams = {
      loanToken: getAddress(prepared.marketParams.loanToken),
      collateralToken: getAddress(prepared.marketParams.collateralToken),
      oracle: getAddress(prepared.marketParams.oracle),
      irm: getAddress(prepared.marketParams.irm),
      lltv: prepared.marketParams.lltv,
    };

    const withAssetOrShares = {
      assets: prepared.mode === "shares" ? 0n : prepared.amountWei,
      shares: prepared.mode === "shares" ? prepared.shares : 0n,
    };

    let txHash: `0x${string}`;
    let status: "confirmed" | "failed";

    switch (prepared.command) {
      case "supply": {
        const result = await txGateway.simulateAndWriteContract({
          address: morphoAddress,
          abi: blueAbi,
          functionName: "supply",
          args: [marketParams, prepared.amountWei, 0n, account, EMPTY_DATA],
        });
        txHash = result.txHash;
        status = result.receipt.status === "success" ? "confirmed" : "failed";
        break;
      }
      case "withdraw": {
        const result = await txGateway.simulateAndWriteContract({
          address: morphoAddress,
          abi: blueAbi,
          functionName: "withdraw",
          args: [
            marketParams,
            withAssetOrShares.assets,
            withAssetOrShares.shares,
            account,
            account,
          ],
        });
        txHash = result.txHash;
        status = result.receipt.status === "success" ? "confirmed" : "failed";
        break;
      }
      case "borrow": {
        const result = await txGateway.simulateAndWriteContract({
          address: morphoAddress,
          abi: blueAbi,
          functionName: "borrow",
          args: [marketParams, prepared.amountWei, 0n, account, account],
        });
        txHash = result.txHash;
        status = result.receipt.status === "success" ? "confirmed" : "failed";
        break;
      }
      case "repay": {
        const result = await txGateway.simulateAndWriteContract({
          address: morphoAddress,
          abi: blueAbi,
          functionName: "repay",
          args: [
            marketParams,
            withAssetOrShares.assets,
            withAssetOrShares.shares,
            account,
            EMPTY_DATA,
          ],
        });
        txHash = result.txHash;
        status = result.receipt.status === "success" ? "confirmed" : "failed";
        break;
      }
      case "supply-collateral": {
        const result = await txGateway.simulateAndWriteContract({
          address: morphoAddress,
          abi: blueAbi,
          functionName: "supplyCollateral",
          args: [marketParams, prepared.amountWei, account, EMPTY_DATA],
        });
        txHash = result.txHash;
        status = result.receipt.status === "success" ? "confirmed" : "failed";
        break;
      }
      case "withdraw-collateral": {
        const result = await txGateway.simulateAndWriteContract({
          address: morphoAddress,
          abi: blueAbi,
          functionName: "withdrawCollateral",
          args: [marketParams, prepared.amountWei, account, account],
        });
        txHash = result.txHash;
        status = result.receipt.status === "success" ? "confirmed" : "failed";
        break;
      }
      default: {
        const exhaustive: never = prepared.command;
        throw new Error(`Unsupported Morpho command: ${exhaustive}`);
      }
    }

    return {
      txHash,
      status,
      chain: prepared.chain,
      command: prepared.command,
      marketId: prepared.marketId,
      token: prepared.token,
      amount: prepared.amountDisplay,
      mode: prepared.mode,
      shares: prepared.sharesDisplay,
      all: prepared.all,
    };
  }
}
