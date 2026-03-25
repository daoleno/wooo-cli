import type { Connection } from "@solana/web3.js";
import { resolveChainId } from "./chain-ids";
import type { WalletOperationContext } from "./signer-protocol";
import type { WalletPort } from "./signers";

export interface SolanaSendTransactionResult {
  status: "confirmed";
  txHash: string;
}

const DEFAULT_SOLANA_CONFIRM_POLL_INTERVAL_MS = 500;
const DEFAULT_SOLANA_CONFIRM_TIMEOUT_MS = 60_000;

function parsePositiveIntegerEnv(envKey: string, fallback: number): number {
  const rawValue = process.env[envKey]?.trim();
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

function getSolanaConfirmPollIntervalMs(): number {
  return parsePositiveIntegerEnv(
    "WOOO_SOLANA_CONFIRM_POLL_INTERVAL_MS",
    DEFAULT_SOLANA_CONFIRM_POLL_INTERVAL_MS,
  );
}

function getSolanaConfirmTimeoutMs(): number {
  return parsePositiveIntegerEnv(
    "WOOO_SOLANA_CONFIRM_TIMEOUT_MS",
    DEFAULT_SOLANA_CONFIRM_TIMEOUT_MS,
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function formatSolanaTransactionError(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return JSON.stringify(error);
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

    await this.waitForConfirmation(txHash);

    return {
      txHash,
      status: "confirmed",
    };
  }

  private async waitForConfirmation(txHash: string): Promise<void> {
    const timeoutMs = getSolanaConfirmTimeoutMs();
    const pollIntervalMs = getSolanaConfirmPollIntervalMs();
    const deadline = Date.now() + timeoutMs;

    while (true) {
      const { value } = await this.connection.getSignatureStatuses([txHash]);
      const status = value[0];

      if (status?.err) {
        throw new Error(
          `Solana transaction ${txHash} failed: ${formatSolanaTransactionError(status.err)}`,
        );
      }

      if (
        status?.confirmationStatus === "confirmed" ||
        status?.confirmationStatus === "finalized"
      ) {
        return;
      }

      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        throw new Error(
          `Solana transaction ${txHash} was not confirmed within ${timeoutMs}ms`,
        );
      }

      await sleep(Math.min(pollIntervalMs, remainingMs));
    }
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
