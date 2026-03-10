import { formatEther, parseEther, zeroAddress } from "viem";
import {
  getAccountAddress,
  getPublicClient,
  getWalletClient,
} from "../../core/evm";
import { STETH_ABI, STETH_ADDRESS } from "./constants";
import type { LidoRewards, LidoStakeResult } from "./types";

export class LidoClient {
  private chain = "ethereum"; // Lido staking is Ethereum only

  constructor(private privateKey?: string) {}

  async stake(amountETH: number): Promise<LidoStakeResult> {
    if (!this.privateKey) throw new Error("Private key required for staking");

    const publicClient = getPublicClient(this.chain);
    const walletClient = getWalletClient(this.privateKey, this.chain);
    const account = getAccountAddress(this.privateKey);
    const value = parseEther(String(amountETH));

    const { request } = await publicClient.simulateContract({
      address: STETH_ADDRESS,
      abi: STETH_ABI,
      functionName: "submit",
      args: [zeroAddress], // no referral
      value,
      account,
    });

    const txHash = await walletClient.writeContract(request as any);
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    return {
      txHash,
      amountETH: amountETH.toString(),
      amountStETH: amountETH.toString(), // 1:1 at time of staking
      status: receipt.status === "success" ? "confirmed" : "failed",
    };
  }

  async rewards(): Promise<LidoRewards> {
    if (!this.privateKey) throw new Error("Private key required");

    const publicClient = getPublicClient(this.chain);
    const account = getAccountAddress(this.privateKey);

    // Get stETH balance
    const stethBalance = (await publicClient.readContract({
      address: STETH_ADDRESS,
      abi: STETH_ABI,
      functionName: "balanceOf",
      args: [account],
    })) as bigint;

    // Get shares to calculate rewards
    const shares = (await publicClient.readContract({
      address: STETH_ADDRESS,
      abi: STETH_ABI,
      functionName: "sharesOf",
      args: [account],
    })) as bigint;

    // Get ETH value of shares (includes rewards)
    const pooledEth = (await publicClient.readContract({
      address: STETH_ADDRESS,
      abi: STETH_ABI,
      functionName: "getPooledEthByShares",
      args: [shares],
    })) as bigint;

    // Rewards = pooled ETH - original deposit (approximated by shares)
    const rewards = pooledEth > shares ? pooledEth - shares : 0n;

    return {
      stETHBalance: formatEther(stethBalance),
      rewardsEarned: formatEther(rewards),
      apr: "~3.5%", // Approximate — would need oracle for real-time APR
    };
  }

  async balance(): Promise<string> {
    if (!this.privateKey) throw new Error("Private key required");

    const publicClient = getPublicClient(this.chain);
    const account = getAccountAddress(this.privateKey);

    const stethBalance = (await publicClient.readContract({
      address: STETH_ADDRESS,
      abi: STETH_ABI,
      functionName: "balanceOf",
      args: [account],
    })) as bigint;

    return formatEther(stethBalance);
  }
}
