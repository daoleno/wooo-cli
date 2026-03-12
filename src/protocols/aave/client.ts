import { type Address, formatUnits, parseUnits } from "viem";
import {
  getAccountAddress,
  getPublicClient,
  getWalletClient,
} from "../../core/evm";
import {
  AAVE_POOL,
  AAVE_POOL_ABI,
  AAVE_POOL_DATA_PROVIDER,
  ERC20_ABI,
  POOL_DATA_PROVIDER_ABI,
  resolveToken,
} from "./constants";
import type { AaveBorrowResult, AaveRate, AaveSupplyResult } from "./types";

// Aave rates are in RAY (1e27)
const RAY = 10n ** 27n;

function rayToPercent(ray: bigint): string {
  // Convert ray to percentage with 2 decimals
  return ((Number(ray) / Number(RAY)) * 100).toFixed(2);
}

export class AaveClient {
  constructor(
    private chain: string,
    private privateKey?: string,
  ) {}

  private getPoolAddress(): Address {
    const addr = AAVE_POOL[this.chain];
    if (!addr) throw new Error(`Aave not supported on ${this.chain}`);
    return addr;
  }

  private getDataProviderAddress(): Address {
    const addr = AAVE_POOL_DATA_PROVIDER[this.chain];
    if (!addr)
      throw new Error(`Aave data provider not available on ${this.chain}`);
    return addr;
  }

  async supply(tokenSymbol: string, amount: number): Promise<AaveSupplyResult> {
    if (!this.privateKey) throw new Error("Private key required");

    const token = resolveToken(tokenSymbol, this.chain);
    if (!token)
      throw new Error(`Unknown token: ${tokenSymbol} on ${this.chain}`);

    const publicClient = getPublicClient(this.chain);
    const walletClient = getWalletClient(this.privateKey, this.chain);
    const account = getAccountAddress(this.privateKey);
    const amountWei = parseUnits(String(amount), token.decimals);
    const pool = this.getPoolAddress();

    // Approve pool to spend tokens
    await this.ensureAllowance(
      token.address,
      amountWei,
      account,
      pool,
      publicClient,
      walletClient,
    );

    // Supply to Aave
    const { request } = await publicClient.simulateContract({
      address: pool,
      abi: AAVE_POOL_ABI,
      functionName: "supply",
      args: [token.address, amountWei, account, 0],
      account,
    });

    const txHash = await walletClient.writeContract(request as any);
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    return {
      txHash,
      token: tokenSymbol.toUpperCase(),
      amount: amount.toString(),
      status: receipt.status === "success" ? "confirmed" : "failed",
    };
  }

  async borrow(tokenSymbol: string, amount: number): Promise<AaveBorrowResult> {
    if (!this.privateKey) throw new Error("Private key required");

    const token = resolveToken(tokenSymbol, this.chain);
    if (!token)
      throw new Error(`Unknown token: ${tokenSymbol} on ${this.chain}`);

    const publicClient = getPublicClient(this.chain);
    const walletClient = getWalletClient(this.privateKey, this.chain);
    const account = getAccountAddress(this.privateKey);
    const amountWei = parseUnits(String(amount), token.decimals);
    const pool = this.getPoolAddress();

    // Borrow with variable rate (2)
    const { request } = await publicClient.simulateContract({
      address: pool,
      abi: AAVE_POOL_ABI,
      functionName: "borrow",
      args: [token.address, amountWei, 2n, 0, account],
      account,
    });

    const txHash = await walletClient.writeContract(request as any);
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    return {
      txHash,
      token: tokenSymbol.toUpperCase(),
      amount: amount.toString(),
      interestRateMode: "variable",
      status: receipt.status === "success" ? "confirmed" : "failed",
    };
  }

  async positions(): Promise<{
    totalCollateralUSD: string;
    totalDebtUSD: string;
    availableBorrowsUSD: string;
    healthFactor: string;
    ltv: string;
  }> {
    if (!this.privateKey) throw new Error("Private key required");

    const publicClient = getPublicClient(this.chain);
    const account = getAccountAddress(this.privateKey);
    const pool = this.getPoolAddress();

    const data = await publicClient.readContract({
      address: pool,
      abi: AAVE_POOL_ABI,
      functionName: "getUserAccountData",
      args: [account],
    });

    // Aave returns values in base currency (USD with 8 decimals)
    const [totalCollateral, totalDebt, availableBorrows, , ltv, healthFactor] =
      data as [bigint, bigint, bigint, bigint, bigint, bigint];

    return {
      totalCollateralUSD: formatUnits(totalCollateral, 8),
      totalDebtUSD: formatUnits(totalDebt, 8),
      availableBorrowsUSD: formatUnits(availableBorrows, 8),
      healthFactor: healthFactor > 0n ? formatUnits(healthFactor, 18) : "∞",
      ltv: `${Number(ltv) / 100}%`,
    };
  }

  async rates(tokenSymbol: string): Promise<AaveRate> {
    const token = resolveToken(tokenSymbol, this.chain);
    if (!token)
      throw new Error(`Unknown token: ${tokenSymbol} on ${this.chain}`);

    const publicClient = getPublicClient(this.chain);
    const dataProvider = this.getDataProviderAddress();

    const data = await publicClient.readContract({
      address: dataProvider,
      abi: POOL_DATA_PROVIDER_ABI,
      functionName: "getReserveData",
      args: [token.address],
    });

    const reserveData = data as unknown as bigint[];

    return {
      token: tokenSymbol.toUpperCase(),
      supplyAPY: `${rayToPercent(reserveData[5])}%`,
      variableBorrowAPY: `${rayToPercent(reserveData[6])}%`,
      stableBorrowAPY: `${rayToPercent(reserveData[7])}%`,
    };
  }

  private async ensureAllowance(
    token: Address,
    amount: bigint,
    owner: Address,
    spender: Address,
    publicClient: any,
    walletClient: any,
  ): Promise<void> {
    const allowance = (await publicClient.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [owner, spender],
    })) as bigint;

    if (allowance < amount) {
      const { request } = await publicClient.simulateContract({
        address: token,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [spender, amount],
        account: owner,
      });
      const hash = await walletClient.writeContract(request as any);
      await publicClient.waitForTransactionReceipt({ hash });
    }
  }
}
