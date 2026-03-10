import { type Address, formatEther, pad, parseUnits } from "viem";
import {
  getAccountAddress,
  getPublicClient,
  getWalletClient,
} from "../../core/evm";
import {
  ERC20_ABI,
  LZ_ENDPOINT_IDS,
  STARGATE_POOLS,
  STARGATE_POOL_ABI,
} from "./constants";
import type { StargateBridgeResult } from "./types";

const SLIPPAGE_BPS = 50; // 0.5%

export class StargateClient {
  constructor(private privateKey?: string) {}

  async quote(
    token: string,
    amount: number,
    fromChain: string,
    toChain: string,
  ): Promise<{ nativeFee: string; token: string; amount: string; fromChain: string; toChain: string }> {
    const pool = this.resolvePool(token, fromChain);
    const dstEid = this.resolveDstEid(toChain);
    const publicClient = getPublicClient(fromChain);
    const amountLD = parseUnits(String(amount), pool.decimals);
    const minAmountLD = (amountLD * BigInt(10000 - SLIPPAGE_BPS)) / 10000n;

    // Need a valid recipient for quote — use zero-padded placeholder
    const toBytes32 = pad("0x0000000000000000000000000000000000000001" as Address, { size: 32 });

    const fee = await publicClient.readContract({
      address: pool.poolAddress,
      abi: STARGATE_POOL_ABI,
      functionName: "quoteSend",
      args: [
        {
          dstEid,
          to: toBytes32,
          amountLD,
          minAmountLD,
          extraOptions: "0x" as `0x${string}`,
          composeMsg: "0x" as `0x${string}`,
          oftCmd: "0x" as `0x${string}`,
        },
        false,
      ],
    });

    const feeData = fee as unknown as { nativeFee: bigint; lzTokenFee: bigint };

    return {
      nativeFee: formatEther(feeData.nativeFee),
      token: token.toUpperCase(),
      amount: amount.toString(),
      fromChain,
      toChain,
    };
  }

  async bridge(
    token: string,
    amount: number,
    fromChain: string,
    toChain: string,
  ): Promise<StargateBridgeResult> {
    if (!this.privateKey) throw new Error("Private key required");

    const pool = this.resolvePool(token, fromChain);
    const dstEid = this.resolveDstEid(toChain);
    const publicClient = getPublicClient(fromChain);
    const walletClient = getWalletClient(this.privateKey, fromChain);
    const account = getAccountAddress(this.privateKey);

    const amountLD = parseUnits(String(amount), pool.decimals);
    const minAmountLD = (amountLD * BigInt(10000 - SLIPPAGE_BPS)) / 10000n;
    const toBytes32 = pad(account, { size: 32 });

    // Get fee quote
    const feeResult = await publicClient.readContract({
      address: pool.poolAddress,
      abi: STARGATE_POOL_ABI,
      functionName: "quoteSend",
      args: [
        {
          dstEid,
          to: toBytes32,
          amountLD,
          minAmountLD,
          extraOptions: "0x" as `0x${string}`,
          composeMsg: "0x" as `0x${string}`,
          oftCmd: "0x" as `0x${string}`,
        },
        false,
      ],
    });

    const fee = feeResult as unknown as { nativeFee: bigint; lzTokenFee: bigint };

    // Approve token spend if not ETH
    if (token.toUpperCase() !== "ETH") {
      await this.ensureAllowance(
        pool.poolAddress, // Stargate pool is the spender
        amountLD,
        account,
        pool.poolAddress,
        publicClient,
        walletClient,
      );
    }

    // Execute bridge
    const { request } = await publicClient.simulateContract({
      address: pool.poolAddress,
      abi: STARGATE_POOL_ABI,
      functionName: "send",
      args: [
        {
          dstEid,
          to: toBytes32,
          amountLD,
          minAmountLD,
          extraOptions: "0x" as `0x${string}`,
          composeMsg: "0x" as `0x${string}`,
          oftCmd: "0x" as `0x${string}`,
        },
        { nativeFee: fee.nativeFee, lzTokenFee: 0n },
        account,
      ],
      value: token.toUpperCase() === "ETH" ? amountLD + fee.nativeFee : fee.nativeFee,
      account,
    });

    const txHash = await walletClient.writeContract(request as any);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    return {
      txHash,
      token: token.toUpperCase(),
      amount: amount.toString(),
      fromChain,
      toChain,
      status: receipt.status === "success" ? "submitted" : "failed",
    };
  }

  supportedRoutes(): Array<{ token: string; chains: string[] }> {
    const tokenChains: Record<string, Set<string>> = {};
    for (const [chain, pools] of Object.entries(STARGATE_POOLS)) {
      for (const token of Object.keys(pools)) {
        if (!tokenChains[token]) tokenChains[token] = new Set();
        tokenChains[token].add(chain);
      }
    }
    return Object.entries(tokenChains).map(([token, chains]) => ({
      token,
      chains: [...chains],
    }));
  }

  private resolvePool(token: string, chain: string) {
    const pool = STARGATE_POOLS[chain]?.[token.toUpperCase()];
    if (!pool) {
      const supported = Object.keys(STARGATE_POOLS[chain] || {}).join(", ");
      throw new Error(
        `Token ${token} not supported on ${chain} via Stargate. Available: ${supported}`,
      );
    }
    return pool;
  }

  private resolveDstEid(chain: string): number {
    const eid = LZ_ENDPOINT_IDS[chain];
    if (!eid) {
      const supported = Object.keys(LZ_ENDPOINT_IDS).join(", ");
      throw new Error(`Chain ${chain} not supported by Stargate. Available: ${supported}`);
    }
    return eid;
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
