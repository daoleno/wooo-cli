import { formatEther } from "viem";
import { mainnet } from "viem/chains";
import {
  getAccountAddress,
  getPublicClient,
  getWalletClient,
} from "../../core/evm";
import type { LidoRewards, LidoStakeResult } from "./types";

export class LidoClient {
  private chain = "ethereum"; // Lido staking is Ethereum only

  constructor(private privateKey?: string) {}

  async stake(amountETH: number): Promise<LidoStakeResult> {
    if (!this.privateKey) throw new Error("Private key required for staking");

    const { LidoSDK } = await import("@lidofinance/lido-ethereum-sdk");

    const rpcProvider = getPublicClient(this.chain) as any;
    const web3Provider = getWalletClient(this.privateKey, this.chain) as any;
    const account = getAccountAddress(this.privateKey);

    const sdk = new LidoSDK({
      chainId: mainnet.id,
      rpcProvider,
      web3Provider,
      logMode: "none",
    });

    const value = String(amountETH);

    const result = await sdk.stake.stakeEth({
      value,
      account,
    });

    return {
      txHash: result.hash,
      amountETH: amountETH.toString(),
      amountStETH: formatEther(result.result?.stethReceived ?? 0n),
      status: result.receipt?.status === "success" ? "confirmed" : "failed",
    };
  }

  async rewards(): Promise<LidoRewards> {
    if (!this.privateKey) throw new Error("Private key required");

    const { LidoSDK } = await import("@lidofinance/lido-ethereum-sdk");

    const rpcProvider = getPublicClient(this.chain) as any;
    const account = getAccountAddress(this.privateKey);

    const sdk = new LidoSDK({
      chainId: mainnet.id,
      rpcProvider,
      logMode: "none",
    });

    // Get stETH balance via SDK
    const stethBalance = await sdk.steth.balance(account);

    // Get rewards from chain events
    const rewardsData = await sdk.rewards.getRewardsFromChain({
      address: account,
      stepBlock: 50000,
      back: { days: 30n },
    });

    // Sum up rewards from all events
    const totalRewards = rewardsData.rewards.reduce(
      (sum, r) => sum + (r.change ?? 0n),
      0n,
    );

    // Get current APR from statistics
    let apr = "N/A";
    try {
      const stats = await sdk.statistics.apr.getLastApr();
      apr = `${(Number(stats) / 100).toFixed(2)}%`;
    } catch {
      // APR stats may not be available
    }

    return {
      stETHBalance: formatEther(stethBalance),
      rewardsEarned: formatEther(totalRewards > 0n ? totalRewards : 0n),
      apr,
    };
  }

  async balance(): Promise<string> {
    if (!this.privateKey) throw new Error("Private key required");

    const { LidoSDK } = await import("@lidofinance/lido-ethereum-sdk");

    const rpcProvider = getPublicClient(this.chain) as any;
    const account = getAccountAddress(this.privateKey);

    const sdk = new LidoSDK({
      chainId: mainnet.id,
      rpcProvider,
      logMode: "none",
    });

    const stethBalance = await sdk.steth.balance(account);
    return formatEther(stethBalance);
  }
}
