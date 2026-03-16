import {
  type Connection,
  type Keypair,
  VersionedTransaction,
} from "@solana/web3.js";

export interface SolanaSendTransactionResult {
  txHash: string;
  status: "confirmed";
}

export class SolanaGateway {
  constructor(
    private connection: Connection,
    private keypair: Keypair,
  ) {}

  async sendVersionedTransaction(
    serializedTransactionBase64: string,
  ): Promise<SolanaSendTransactionResult> {
    const txBuf = Buffer.from(serializedTransactionBase64, "base64");
    const transaction = VersionedTransaction.deserialize(txBuf);
    transaction.sign([this.keypair]);

    const txHash = await this.connection.sendRawTransaction(
      transaction.serialize(),
      { skipPreflight: false, maxRetries: 2 },
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
