import type {
  Abi,
  Address,
  Hash,
  PublicClient,
  TransactionReceipt,
} from "viem";
import { encodeFunctionData } from "viem";
import { resolveChainId } from "./chain-ids";
import type {
  ApprovalPrompt,
  TokenApprovalIntent,
  WalletOperationContext,
} from "./signer-protocol";
import type { WalletPort } from "./signers";

export interface ContractWriteOptions {
  address: Address;
  abi: Abi;
  intent?: TokenApprovalIntent;
  functionName: string;
  args?: readonly unknown[];
  context?: Partial<WalletOperationContext>;
  prompt?: ApprovalPrompt;
  value?: bigint;
}

export interface ContractWriteResult {
  receipt: TransactionReceipt;
  result: unknown;
  txHash: Hash;
}

export class TxGateway {
  private readonly chainId: string;

  constructor(
    chainName: string,
    private publicClient: PublicClient,
    private walletPort: WalletPort,
    private context?: WalletOperationContext,
  ) {
    this.chainId = resolveChainId(chainName);
  }

  get account(): Address {
    return this.walletPort.address as Address;
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
      account: this.walletPort.address as Address,
    });

    const operationContext = {
      ...(this.context ?? {}),
      ...(options.context ?? {}),
    };
    const txHash = await this.walletPort.signAndSendTransaction(
      this.chainId,
      {
        format: "evm-transaction",
        to: options.address,
        data: encodeFunctionData({
          abi: options.abi,
          functionName: options.functionName,
          args: options.args as unknown[],
        }),
        value: options.value,
      },
      operationContext,
      options.prompt,
      options.intent,
    );
    const receipt = await this.waitForReceipt(txHash as Hash);

    return {
      txHash: txHash as Hash,
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
      args: [this.walletPort.address as Address, spender],
    })) as bigint;

    if (allowance >= amount) {
      return false;
    }

    await this.simulateAndWriteContract({
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      args: [spender, amount],
      intent: {
        kind: "token-approval",
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
          ...(this.context?.protocol
            ? { protocol: this.context.protocol }
            : {}),
          ...(this.context?.command ? { command: this.context.command } : {}),
        },
      },
    });

    return true;
  }
}
