import type {
  Abi,
  Address,
  Hash,
  PublicClient,
  TransactionReceipt,
  WalletClient,
} from "viem";

export interface ContractWriteOptions {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
}

export interface ContractWriteResult {
  receipt: TransactionReceipt;
  result: unknown;
  txHash: Hash;
}

export class TxGateway {
  constructor(
    private publicClient: PublicClient,
    private walletClient: WalletClient,
    private account: Address,
  ) {}

  async waitForReceipt(hash: Hash): Promise<TransactionReceipt> {
    return await this.publicClient.waitForTransactionReceipt({ hash });
  }

  async simulateAndWriteContract(
    options: ContractWriteOptions,
  ): Promise<ContractWriteResult> {
    const { request, result } = await this.publicClient.simulateContract({
      address: options.address,
      abi: options.abi,
      functionName: options.functionName as never,
      args: (options.args ?? []) as never,
      value: options.value,
      account: this.account,
    });

    const txHash = await this.walletClient.writeContract(request);
    const receipt = await this.waitForReceipt(txHash);

    return {
      txHash,
      receipt,
      result,
    };
  }

  async ensureAllowance(
    token: Address,
    spender: Address,
    amount: bigint,
    erc20Abi: Abi,
  ): Promise<boolean> {
    const allowance = (await this.publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "allowance",
      args: [this.account, spender],
    })) as bigint;

    if (allowance >= amount) {
      return false;
    }

    await this.simulateAndWriteContract({
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      args: [spender, amount],
    });

    return true;
  }
}
