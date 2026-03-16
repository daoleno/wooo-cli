import type {
  Abi,
  Address,
  Hash,
  PublicClient,
  TransactionReceipt,
} from "viem";
import type {
  EvmApprovalRequest,
  SignerPrompt,
  SignerRequestOrigin,
} from "./signer-protocol";
import type { EvmSigner } from "./signers";

export interface ContractWriteOptions {
  address: Address;
  approval?: EvmApprovalRequest;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  origin?: Partial<SignerRequestOrigin>;
  prompt?: SignerPrompt;
  value?: bigint;
}

export interface ContractWriteResult {
  receipt: TransactionReceipt;
  result: unknown;
  txHash: Hash;
}

export class TxGateway {
  constructor(
    private chainName: string,
    private publicClient: PublicClient,
    private signer: EvmSigner,
    private origin?: SignerRequestOrigin,
  ) {}

  get account(): Address {
    return this.signer.address;
  }

  async waitForReceipt(hash: Hash): Promise<TransactionReceipt> {
    return await this.publicClient.waitForTransactionReceipt({ hash });
  }

  async simulateAndWriteContract(
    options: ContractWriteOptions,
  ): Promise<ContractWriteResult> {
    const { result } = await this.publicClient.simulateContract({
      address: options.address,
      abi: options.abi,
      functionName: options.functionName as never,
      args: (options.args ?? []) as never,
      value: options.value,
      account: this.signer.address,
    });

    const origin = {
      ...(this.origin ?? {}),
      ...(options.origin ?? {}),
    };
    const txHash = await this.signer.writeContract(
      this.chainName,
      {
        address: options.address,
        abi: options.abi,
        functionName: options.functionName,
        args: options.args,
        value: options.value,
      },
      {
        approval: options.approval,
        origin,
        prompt: options.prompt,
      },
    );
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
      args: [this.signer.address, spender],
    })) as bigint;

    if (allowance >= amount) {
      return false;
    }

    await this.simulateAndWriteContract({
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      args: [spender, amount],
      approval: {
        token,
        spender,
        amount,
      },
      prompt: {
        action: "Approve token spend",
        details: {
          token,
          spender,
          amount: amount.toString(),
          ...(this.origin?.protocol ? { protocol: this.origin.protocol } : {}),
          ...(this.origin?.command ? { command: this.origin.command } : {}),
        },
      },
    });

    return true;
  }
}
