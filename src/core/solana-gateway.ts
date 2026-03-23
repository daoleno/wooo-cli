import type { Connection } from "@solana/web3.js";
import type { SignerRequestOrigin } from "./signer-protocol";
import type { WoooSigner } from "./signers";

export interface SolanaSendTransactionResult {
  status: "confirmed";
  txHash: string;
}

export class SolanaGateway {
  constructor(
    private connection: Connection,
    private network: string,
    private signer: WoooSigner,
    private origin?: SignerRequestOrigin,
  ) {}

  async sendVersionedTransaction(
    serializedTransactionBase64: string,
  ): Promise<SolanaSendTransactionResult> {
    const txHash = await this.signer.sendTransaction(
      this.network,
      serializedTransactionBase64,
      this.origin,
      {
        action: `Authorize Solana transaction for ${this.signer.address}`,
        details: {
          network: this.network,
          wallet: this.signer.address,
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
