import type { LidoSDKCoreProps } from "@lidofinance/lido-ethereum-sdk";
import { type Address, formatEther, parseEther, zeroAddress } from "viem";
import { getPublicClient } from "../../core/evm";
import type { WoooSigner } from "../../core/signers";
import { TxGateway } from "../../core/tx-gateway";
import { STETH_ABI, STETH_ADDRESS } from "./constants";
import type { LidoRewards, LidoStakeResult } from "./types";

export class LidoClient {
  private chain = "ethereum";

  constructor(private signer?: WoooSigner) {}

  async stake(amountETH: number): Promise<LidoStakeResult> {
    if (!this.signer) throw new Error("Signer required for staking");

    const publicClient = getPublicClient(this.chain);
    const txGateway = new TxGateway(this.chain, publicClient, this.signer, {
      group: "stake",
      protocol: "lido",
      command: "stake",
    });
    const balanceBefore = (await publicClient.readContract({
      address: STETH_ADDRESS,
      abi: STETH_ABI,
      functionName: "balanceOf",
      args: [this.signer.address as Address],
    })) as bigint;

    const { receipt, txHash } = await txGateway.simulateAndWriteContract({
      address: STETH_ADDRESS,
      abi: STETH_ABI,
      functionName: "submit",
      args: [zeroAddress],
      value: parseEther(String(amountETH)),
    });

    const balanceAfter = (await publicClient.readContract({
      address: STETH_ADDRESS,
      abi: STETH_ABI,
      functionName: "balanceOf",
      args: [this.signer.address as Address],
    })) as bigint;

    return {
      txHash,
      amountETH: amountETH.toString(),
      amountStETH: formatEther(
        balanceAfter > balanceBefore ? balanceAfter - balanceBefore : 0n,
      ),
      status: receipt.status === "success" ? "confirmed" : "failed",
    };
  }

  async rewards(address: string): Promise<LidoRewards> {
    const { LidoSDK } = await import("@lidofinance/lido-ethereum-sdk");

    const rpcProvider = getPublicClient(this.chain);
    const sdkConfig: LidoSDKCoreProps = {
      chainId: 1,
      rpcProvider,
      logMode: "none",
    };
    const sdk = new LidoSDK(sdkConfig);

    const account = address as `0x${string}`;
    const stethBalance = await sdk.steth.balance(account);
    const rewardsData = await sdk.rewards.getRewardsFromChain({
      address: account,
      stepBlock: 50000,
      back: { days: 30n },
    });

    const totalRewards = rewardsData.rewards.reduce(
      (sum, reward) => sum + (reward.change ?? 0n),
      0n,
    );

    let apr = "N/A";
    try {
      const stats = await sdk.statistics.apr.getLastApr();
      apr = `${(Number(stats) / 100).toFixed(2)}%`;
    } catch {
      // APR stats may be unavailable.
    }

    return {
      stETHBalance: formatEther(stethBalance),
      rewardsEarned: formatEther(totalRewards > 0n ? totalRewards : 0n),
      apr,
    };
  }

  async balance(address: string): Promise<string> {
    const publicClient = getPublicClient(this.chain);
    const stethBalance = (await publicClient.readContract({
      address: STETH_ADDRESS,
      abi: STETH_ABI,
      functionName: "balanceOf",
      args: [address as `0x${string}`],
    })) as bigint;
    return formatEther(stethBalance);
  }
}
