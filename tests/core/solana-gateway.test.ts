import { afterEach, describe, expect, test } from "bun:test";
import { SolanaGateway } from "../../src/core/solana-gateway";
import type { WalletPort } from "../../src/core/signers";

const ORIGINAL_CONFIRM_TIMEOUT = process.env.WOOO_SOLANA_CONFIRM_TIMEOUT_MS;
const ORIGINAL_CONFIRM_POLL_INTERVAL =
  process.env.WOOO_SOLANA_CONFIRM_POLL_INTERVAL_MS;
const TX_HASH = "3x6tv1Jgv7N83YgGh3K7H3ULicWHf66A1VpzwuNFuGqmoeZaZX6mE6oPD58x35H5TADaBrZEcD3MpKhsR4H2Uvep";

function createWalletPort(): WalletPort {
  return {
    accountLabel: "solana-test",
    address: "9xQeWvG816bUx9EPjHmaT23yvVMfQ4qZQ9fFZQ4T7j4A",
    async signTypedData() {
      throw new Error("not used");
    },
    async signAndSendTransaction() {
      return TX_HASH;
    },
    async signProtocolPayload() {
      throw new Error("not used");
    },
  };
}

afterEach(() => {
  if (ORIGINAL_CONFIRM_TIMEOUT === undefined) {
    delete process.env.WOOO_SOLANA_CONFIRM_TIMEOUT_MS;
  } else {
    process.env.WOOO_SOLANA_CONFIRM_TIMEOUT_MS = ORIGINAL_CONFIRM_TIMEOUT;
  }

  if (ORIGINAL_CONFIRM_POLL_INTERVAL === undefined) {
    delete process.env.WOOO_SOLANA_CONFIRM_POLL_INTERVAL_MS;
  } else {
    process.env.WOOO_SOLANA_CONFIRM_POLL_INTERVAL_MS =
      ORIGINAL_CONFIRM_POLL_INTERVAL;
  }
});

describe("SolanaGateway", () => {
  test("polls signature status until the transaction is confirmed", async () => {
    process.env.WOOO_SOLANA_CONFIRM_TIMEOUT_MS = "100";
    process.env.WOOO_SOLANA_CONFIRM_POLL_INTERVAL_MS = "0";

    const calls: string[][] = [];
    const connection = {
      async getSignatureStatuses(signatures: string[]) {
        calls.push(signatures);
        return {
          context: { slot: 1 },
          value: [
            calls.length === 1
              ? null
              : {
                  confirmationStatus: "confirmed",
                  confirmations: 0,
                  err: null,
                  slot: 1,
                  status: { Ok: null },
                },
          ],
        };
      },
    } as const;

    const gateway = new SolanaGateway(
      connection as never,
      "mainnet-beta",
      createWalletPort(),
      {
        group: "dex",
        protocol: "jupiter",
        command: "swap",
      },
    );

    const result = await gateway.sendVersionedTransaction("dGVzdA==");

    expect(result).toEqual({
      status: "confirmed",
      txHash: TX_HASH,
    });
    expect(calls).toEqual([[TX_HASH], [TX_HASH]]);
  });

  test("fails when the RPC reports a transaction error", async () => {
    process.env.WOOO_SOLANA_CONFIRM_TIMEOUT_MS = "100";
    process.env.WOOO_SOLANA_CONFIRM_POLL_INTERVAL_MS = "0";

    const connection = {
      async getSignatureStatuses() {
        return {
          context: { slot: 1 },
          value: [
            {
              confirmationStatus: "processed",
              confirmations: null,
              err: "InstructionError",
              slot: 1,
              status: { Err: "InstructionError" },
            },
          ],
        };
      },
    } as const;

    const gateway = new SolanaGateway(
      connection as never,
      "mainnet-beta",
      createWalletPort(),
    );

    await expect(gateway.sendVersionedTransaction("dGVzdA==")).rejects.toThrow(
      `Solana transaction ${TX_HASH} failed: InstructionError`,
    );
  });
});
