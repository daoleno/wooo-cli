import type { Connection } from "@solana/web3.js";
import type { SignerRequestOrigin } from "./signer-protocol";
import type { SolanaSigner } from "./signers";

export interface SolanaSendTransactionResult {
  status: "confirmed";
  txHash: string;
}

export class SolanaGateway {
  constructor(
    private connection: Connection,
    private network: string,
    private signer: SolanaSigner,
    private origin?: SignerRequestOrigin,
  ) {}

  async sendVersionedTransaction(
    serializedTransactionBase64: string,
  ): Promise<SolanaSendTransactionResult> {
    const txHash = await this.signer.sendVersionedTransaction(
      this.network,
      serializedTransactionBase64,
      {
        origin: this.origin,
        prompt: {
          action: `Authorize Solana transaction for ${this.signer.address}`,
          details: {
            network: this.network,
            wallet: this.signer.address,
          },
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
