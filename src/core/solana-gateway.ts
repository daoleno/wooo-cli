import type { Connection } from "@solana/web3.js";
import { resolveChainId } from "./chain-ids";
import type { WalletOperationContext } from "./signer-protocol";
import type { WalletPort } from "./signers";

export interface SolanaSendTransactionResult {
  status: "confirmed";
  txHash: string;
}

export class SolanaGateway {
  private readonly chainId: string;

  constructor(
    private connection: Connection,
    private network: string,
    private walletPort: WalletPort,
    private context?: WalletOperationContext,
  ) {
    this.chainId = resolveSolanaChainId(network);
  }

  async sendVersionedTransaction(
    serializedTransactionBase64: string,
  ): Promise<SolanaSendTransactionResult> {
    const txHash = await this.walletPort.signAndSendTransaction(
      this.chainId,
      {
        format: "solana-versioned-transaction",
        serializedTransactionBase64,
      },
      this.context,
      {
        action: `Authorize Solana transaction for ${this.walletPort.address}`,
        details: {
          network: this.network,
          wallet: this.walletPort.address,
        },
      },
    );

    const latestBlockhash = await this.connection.getLatestBlockhash();
    await this.connection.confirmTransaction({
      signature: txHash,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    });

    return {
      txHash,
      status: "confirmed",
    };
  }
}

function resolveSolanaChainId(network: string): string {
  if (network === "mainnet-beta") {
    return resolveChainId("solana");
  }
  if (network === "devnet") {
    return resolveChainId("solana-devnet");
  }
  return resolveChainId(network);
}
