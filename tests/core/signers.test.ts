import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createWallet,
  importWalletPrivateKey,
} from "@open-wallet-standard/core";
import ccxt from "ccxt";
import {
  deserializeSignerPayload,
  type HttpSignerMetadata,
  type SignerCommandRequest,
  type SignerCommandResponse,
  serializeSignerPayload,
} from "../../src/core/signer-protocol";
import {
  createWalletPort,
  ExternalSigner,
  fetchSignerMetadata,
  normalizeSignerUrl,
  OwsSigner,
  type ResolvedAccount,
} from "../../src/core/signers";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const TEST_TX_HASH = `0x${"12".repeat(32)}`;
const TEST_SIGNATURE_HEX = `0x${"78".repeat(65)}`;
const TEST_PRIVATE_KEY = `0x${"11".repeat(32)}`;

interface HyperliquidSigningExchange {
  options: {
    sandboxMode?: boolean;
  };
  privateKey: string;
  signL1Action(
    action: Record<string, unknown>,
    nonce: number,
    vaultAddress?: string,
    expiresAfter?: number,
  ): {
    r: string;
    s: string;
    v: number;
  };
}

function createLocalAccount(
  account: Omit<
    Extract<ResolvedAccount, { custody: "local" }>,
    "chainFamily" | "custody"
  >,
): ResolvedAccount {
  return {
    ...account,
    chainFamily: "evm",
    custody: "local",
  };
}

function createRemoteAccount(
  account: Omit<
    Extract<ResolvedAccount, { custody: "remote" }>,
    "chainFamily" | "custody"
  >,
): ResolvedAccount {
  return {
    ...account,
    chainFamily: "evm",
    custody: "remote",
  };
}

describe("signers", () => {
  const originalEnv = {
    OWS_PASSPHRASE: process.env.OWS_PASSPHRASE,
    WOOO_CONFIG_DIR: process.env.WOOO_CONFIG_DIR,
    WOOO_MASTER_PASSWORD: process.env.WOOO_MASTER_PASSWORD,
    WOOO_HTTP_SIGNER_POLL_INTERVAL_MS:
      process.env.WOOO_HTTP_SIGNER_POLL_INTERVAL_MS,
    WOOO_HTTP_SIGNER_REQUEST_TIMEOUT_MS:
      process.env.WOOO_HTTP_SIGNER_REQUEST_TIMEOUT_MS,
    WOOO_HTTP_SIGNER_TIMEOUT_MS: process.env.WOOO_HTTP_SIGNER_TIMEOUT_MS,
    WOOO_SIGNER_AUTH_TOKEN: process.env.WOOO_SIGNER_AUTH_TOKEN,
  };

  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "wooo-signers-test-"));
    process.env.WOOO_CONFIG_DIR = tempDir;
    process.env.OWS_PASSPHRASE = "top-secret";
    process.env.WOOO_MASTER_PASSWORD = "top-secret";
    process.env.WOOO_SIGNER_AUTH_TOKEN = "signer-token-test";
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  test("createWalletPort creates OwsSigner for local custody", () => {
    const account = createLocalAccount({
      label: "my-wallet",
      walletId: "wallet-123",
      address: ZERO_ADDRESS,
      chainId: "eip155:1",
      vaultPath: join(tempDir, "vault"),
    });

    const signer = createWalletPort(account);
    expect(signer).toBeInstanceOf(OwsSigner);
    expect(signer.accountLabel).toBe("my-wallet");
    expect(signer.address).toBe(ZERO_ADDRESS);
  });

  test("createWalletPort creates ExternalSigner for remote custody", () => {
    const account = createRemoteAccount({
      label: "ext-wallet",
      address: ZERO_ADDRESS,
      chainId: "eip155:1",
      signerUrl: "http://127.0.0.1:8787/",
    });

    const signer = createWalletPort(account);
    expect(signer).toBeInstanceOf(ExternalSigner);
    expect(signer.accountLabel).toBe("ext-wallet");
    expect(signer.address).toBe(ZERO_ADDRESS);
  });

  test("normalizeSignerUrl validates URLs", () => {
    expect(normalizeSignerUrl("http://127.0.0.1:8787")).toBe(
      "http://127.0.0.1:8787/",
    );
    expect(normalizeSignerUrl("https://signer.example.com/api")).toBe(
      "https://signer.example.com/api",
    );
    expect(() => normalizeSignerUrl("http://example.com/signer")).toThrow(
      /https/i,
    );
    expect(() => normalizeSignerUrl("ftp://example.com")).toThrow(/protocol/);
  });

  test("OwsSigner uses the configured vault path for local typed data signing", async () => {
    const vaultPath = join(tempDir, "vault");
    const walletInfo = createWallet(
      "signer-wallet",
      "top-secret",
      12,
      vaultPath,
    );
    const evmAccount = walletInfo.accounts.find((account) =>
      account.chainId.startsWith("eip155:"),
    );

    const signer = createWalletPort(
      createLocalAccount({
        label: walletInfo.name,
        walletId: walletInfo.id,
        address: evmAccount?.address ?? ZERO_ADDRESS,
        chainId: "eip155:1",
        vaultPath,
      }),
    );

    const signature = await signer.signTypedData("eip155:1", {
      domain: {
        name: "WalletPort",
        version: "1",
        chainId: 1,
      },
      types: {
        WalletPort: [{ name: "wallet", type: "address" }],
      },
      primaryType: "WalletPort",
      message: {
        wallet: evmAccount?.address ?? ZERO_ADDRESS,
      },
    });
    expect(signature).toMatch(/^(0x)?[0-9a-f]+$/i);
  });

  test("OwsSigner matches ccxt for Hyperliquid protocol payload signatures", async () => {
    const vaultPath = join(tempDir, "vault");
    const walletInfo = await importWalletPrivateKey(
      "hyperliquid-wallet",
      TEST_PRIVATE_KEY,
      "top-secret",
      vaultPath,
      "evm",
    );
    const evmAccount = walletInfo.accounts.find((account) =>
      account.chainId.startsWith("eip155:"),
    );
    const signer = createWalletPort(
      createLocalAccount({
        label: walletInfo.name,
        walletId: walletInfo.id,
        address: evmAccount?.address ?? ZERO_ADDRESS,
        chainId: "eip155:42161",
        vaultPath,
      }),
    );

    const request = {
      action: {
        type: "order",
        orders: [
          {
            a: 0,
            b: true,
            p: "100000",
            s: "0.001",
            r: false,
            t: {
              limit: {
                tif: "Gtc",
              },
            },
          },
        ],
        grouping: "na",
      },
      nonce: 1_700_000_000_000,
      vaultAddress: `0x${"22".repeat(20)}`,
      expiresAfter: 1_700_000_005_000,
      sandbox: true,
      context: {
        actionType: "order",
        symbol: "BTC",
      },
    } as const;

    const { signature } = await signer.signProtocolPayload({
      protocol: "hyperliquid",
      payload: request,
    });
    const exchange =
      new ccxt.hyperliquid() as unknown as HyperliquidSigningExchange;
    exchange.privateKey = TEST_PRIVATE_KEY;
    exchange.options = {
      ...exchange.options,
      sandboxMode: true,
    };

    const expected = exchange.signL1Action(
      request.action,
      request.nonce,
      request.vaultAddress.slice(2),
      request.expiresAfter,
    );

    expect(signature).toEqual(expected);
  });

  test("ExternalSigner invokes a local signer service", async () => {
    let capturedRequest: SignerCommandRequest | null = null;
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        capturedRequest = deserializeSignerPayload<SignerCommandRequest>(
          await request.text(),
        );
        const response: SignerCommandResponse = {
          ok: true,
          txHash: TEST_TX_HASH,
        };
        return new Response(serializeSignerPayload(response), {
          headers: {
            "content-type": "application/json",
          },
        });
      },
    });

    try {
      const signer = createWalletPort(
        createRemoteAccount({
          label: "service-wallet",
          address: ZERO_ADDRESS,
          chainId: "eip155:1",
          signerUrl: normalizeSignerUrl(server.url.toString()),
        }),
      );

      const txHash = await signer.signAndSendTransaction("eip155:1", {
        format: "evm-transaction",
        to: ZERO_ADDRESS,
        data: "0x",
      });

      expect(txHash).toBe(TEST_TX_HASH);
      expect(capturedRequest?.operation).toBe("sign-and-send-transaction");
      expect(capturedRequest?.account.label).toBe("service-wallet");
      expect(capturedRequest?.clientRequestId).toBeString();
    } finally {
      await server.stop(true);
    }
  });

  test("ExternalSigner waits for an async local signer service result", async () => {
    process.env.WOOO_HTTP_SIGNER_POLL_INTERVAL_MS = "1";
    process.env.WOOO_HTTP_SIGNER_TIMEOUT_MS = "250";

    let capturedRequest: SignerCommandRequest | null = null;
    let statusChecks = 0;

    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        const url = new URL(request.url);
        if (request.method === "POST" && url.pathname === "/") {
          capturedRequest = deserializeSignerPayload<SignerCommandRequest>(
            await request.text(),
          );
          const response: SignerCommandResponse = {
            ok: true,
            status: "pending",
            requestId: "req-async-1",
            pollAfterMs: 0,
          };
          return new Response(serializeSignerPayload(response), {
            status: 202,
            headers: {
              "content-type": "application/json",
            },
          });
        }

        if (
          request.method === "GET" &&
          url.pathname === "/requests/req-async-1"
        ) {
          statusChecks += 1;
          const response: SignerCommandResponse =
            statusChecks < 2
              ? {
                  ok: true,
                  status: "pending",
                  requestId: "req-async-1",
                  pollAfterMs: 0,
                }
              : {
                  ok: true,
                  txHash: TEST_TX_HASH,
                };
          return new Response(serializeSignerPayload(response), {
            status: statusChecks < 2 ? 202 : 200,
            headers: {
              "content-type": "application/json",
            },
          });
        }

        return new Response(
          serializeSignerPayload({
            ok: false,
            error: `Unexpected route: ${request.method} ${url.pathname}`,
          }),
          {
            status: 404,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      },
    });

    try {
      const signer = createWalletPort(
        createRemoteAccount({
          label: "service-wallet",
          address: ZERO_ADDRESS,
          chainId: "eip155:1",
          signerUrl: normalizeSignerUrl(server.url.toString()),
        }),
      );

      const txHash = await signer.signAndSendTransaction("eip155:1", {
        format: "evm-transaction",
        to: ZERO_ADDRESS,
        data: "0x",
      });

      expect(txHash).toBe(TEST_TX_HASH);
      expect(capturedRequest?.operation).toBe("sign-and-send-transaction");
      expect(capturedRequest?.clientRequestId).toBeString();
      expect(statusChecks).toBe(2);
    } finally {
      await server.stop(true);
    }
  });

  test("ExternalSigner times out when an async signer service never completes", async () => {
    process.env.WOOO_HTTP_SIGNER_POLL_INTERVAL_MS = "1";
    process.env.WOOO_HTTP_SIGNER_TIMEOUT_MS = "10";

    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        const url = new URL(request.url);
        if (
          (request.method === "POST" && url.pathname === "/") ||
          (request.method === "GET" && url.pathname === "/requests/req-stuck-1")
        ) {
          const response: SignerCommandResponse = {
            ok: true,
            status: "pending",
            requestId: "req-stuck-1",
            pollAfterMs: 0,
          };
          return new Response(serializeSignerPayload(response), {
            status: 202,
            headers: {
              "content-type": "application/json",
            },
          });
        }

        return new Response(
          serializeSignerPayload({
            ok: false,
            error: `Unexpected route: ${request.method} ${url.pathname}`,
          }),
          {
            status: 404,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      },
    });

    try {
      const signer = createWalletPort(
        createRemoteAccount({
          label: "service-wallet",
          address: ZERO_ADDRESS,
          chainId: "eip155:1",
          signerUrl: normalizeSignerUrl(server.url.toString()),
        }),
      );

      await expect(
        signer.signAndSendTransaction("eip155:1", {
          format: "evm-transaction",
          to: ZERO_ADDRESS,
          data: "0x",
        }),
      ).rejects.toThrow(/timed out/);
    } finally {
      await server.stop(true);
    }
  });

  test("ExternalSigner supports Hyperliquid protocol payload signing via a local signer service", async () => {
    let capturedRequest: SignerCommandRequest | null = null;
    const signature = {
      r: `0x${"34".repeat(32)}`,
      s: `0x${"56".repeat(32)}`,
      v: 27,
    } as const;

    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        capturedRequest = deserializeSignerPayload<SignerCommandRequest>(
          await request.text(),
        );
        const response: SignerCommandResponse = {
          ok: true,
          signature,
        };
        return new Response(serializeSignerPayload(response), {
          headers: {
            "content-type": "application/json",
          },
        });
      },
    });

    try {
      const signer = createWalletPort(
        createRemoteAccount({
          label: "service-wallet",
          address: ZERO_ADDRESS,
          chainId: "eip155:1",
          signerUrl: normalizeSignerUrl(server.url.toString()),
        }),
      );

      const result = await signer.signProtocolPayload({
        protocol: "hyperliquid",
        payload: {
          action: {
            type: "order",
          },
          nonce: 123,
          context: {
            actionType: "order",
            symbol: "BTC",
          },
        },
      });

      expect(result).toEqual({
        protocol: "hyperliquid",
        signature,
      });
      expect(capturedRequest?.operation).toBe("sign-protocol-payload");
      expect(capturedRequest?.account.label).toBe("service-wallet");
      expect(capturedRequest?.clientRequestId).toBeString();
    } finally {
      await server.stop(true);
    }
  });

  test("ExternalSigner supports typed data signatures via a local signer service", async () => {
    let capturedRequest: SignerCommandRequest | null = null;

    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        capturedRequest = deserializeSignerPayload<SignerCommandRequest>(
          await request.text(),
        );
        const response: SignerCommandResponse = {
          ok: true,
          signatureHex: TEST_SIGNATURE_HEX,
        };
        return new Response(serializeSignerPayload(response), {
          headers: {
            "content-type": "application/json",
          },
        });
      },
    });

    try {
      const signer = createWalletPort(
        createRemoteAccount({
          label: "service-wallet",
          address: ZERO_ADDRESS,
          chainId: "eip155:1",
          signerUrl: normalizeSignerUrl(server.url.toString()),
        }),
      );

      const signatureHex = await signer.signTypedData("eip155:137", {
        domain: {
          name: "ClobAuthDomain",
          version: "1",
          chainId: 137,
        },
        types: {
          ClobAuth: [{ name: "address", type: "address" }],
        },
        primaryType: "ClobAuth",
        message: {
          address: ZERO_ADDRESS,
        },
      });

      expect(signatureHex).toBe(TEST_SIGNATURE_HEX);
      expect(capturedRequest?.operation).toBe("sign-typed-data");
      expect(capturedRequest?.account.label).toBe("service-wallet");
      expect(capturedRequest?.clientRequestId).toBeString();
    } finally {
      await server.stop(true);
    }
  });

  test("ExternalSigner invokes a transport with bearer auth", async () => {
    let capturedAuthHeader: string | null = null;
    let capturedRequest: SignerCommandRequest | null = null;

    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        capturedAuthHeader = request.headers.get("authorization");
        capturedRequest = deserializeSignerPayload<SignerCommandRequest>(
          await request.text(),
        );
        const response: SignerCommandResponse = {
          ok: true,
          txHash: TEST_TX_HASH,
        };
        return new Response(serializeSignerPayload(response), {
          headers: {
            "content-type": "application/json",
          },
        });
      },
    });

    try {
      const signer = createWalletPort(
        createRemoteAccount({
          label: "signer-wallet",
          address: ZERO_ADDRESS,
          chainId: "eip155:1",
          signerUrl: normalizeSignerUrl(server.url.toString()),
          authEnv: "WOOO_SIGNER_AUTH_TOKEN",
        }),
      );

      const txHash = await signer.signAndSendTransaction("eip155:1", {
        format: "evm-transaction",
        to: ZERO_ADDRESS,
        data: "0x",
      });

      expect(txHash).toBe(TEST_TX_HASH);
      expect(capturedAuthHeader).toBe("Bearer signer-token-test");
      expect(capturedRequest?.operation).toBe("sign-and-send-transaction");
      expect(capturedRequest?.account.label).toBe("signer-wallet");
      expect(capturedRequest?.clientRequestId).toBeString();
    } finally {
      await server.stop(true);
    }
  });

  test("fetchSignerMetadata loads and validates signer metadata", async () => {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch() {
        const metadata: HttpSignerMetadata = {
          version: 1,
          kind: "wooo-wallet-transport",
          transport: "http-signer",
          accounts: [
            {
              address: ZERO_ADDRESS,
              chainFamily: "evm",
              operations: ["sign-and-send-transaction"],
            },
          ],
        };
        return new Response(JSON.stringify(metadata), {
          headers: {
            "content-type": "application/json",
          },
        });
      },
    });

    try {
      const metadata = await fetchSignerMetadata(server.url.toString());
      expect(metadata.accounts[0]?.address).toBe(ZERO_ADDRESS);
      expect(metadata.accounts[0]?.operations).toEqual([
        "sign-and-send-transaction",
      ]);
    } finally {
      await server.stop(true);
    }
  });

  test("fetchSignerMetadata loads metadata with bearer auth", async () => {
    let capturedAuthHeader: string | null = null;
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        capturedAuthHeader = request.headers.get("authorization");
        const metadata: HttpSignerMetadata = {
          version: 1,
          kind: "wooo-wallet-transport",
          transport: "http-signer",
          accounts: [
            {
              address: ZERO_ADDRESS,
              chainFamily: "evm",
              operations: ["sign-and-send-transaction"],
            },
          ],
        };
        return new Response(JSON.stringify(metadata), {
          headers: {
            "content-type": "application/json",
          },
        });
      },
    });

    try {
      const metadata = await fetchSignerMetadata(
        server.url.toString(),
        "WOOO_SIGNER_AUTH_TOKEN",
      );
      expect(capturedAuthHeader).toBe("Bearer signer-token-test");
      expect(metadata.accounts[0]?.address).toBe(ZERO_ADDRESS);
      expect(metadata.kind).toBe("wooo-wallet-transport");
    } finally {
      await server.stop(true);
    }
  });

  test("fetchSignerMetadata rejects non-signer auth env names", async () => {
    await expect(
      fetchSignerMetadata("http://127.0.0.1:8787/", "OPENAI_API_KEY"),
    ).rejects.toThrow(/WOOO_SIGNER_AUTH_/);
  });

  test("fetchSignerMetadata times out when the signer does not respond", async () => {
    process.env.WOOO_HTTP_SIGNER_REQUEST_TIMEOUT_MS = "10";

    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch() {
        await Bun.sleep(50);
        return new Response(
          JSON.stringify({
            version: 1,
            kind: "wooo-wallet-transport",
            transport: "http-signer",
            accounts: [
              {
                address: ZERO_ADDRESS,
                chainFamily: "evm",
                operations: ["sign-and-send-transaction"],
              },
            ],
          }),
          {
            headers: {
              "content-type": "application/json",
            },
          },
        );
      },
    });

    try {
      await expect(fetchSignerMetadata(server.url.toString())).rejects.toThrow(
        /timed out/i,
      );
    } finally {
      await server.stop(true);
    }
  });

  test("ExternalSigner retries the initial POST with the same clientRequestId after a timeout", async () => {
    process.env.WOOO_HTTP_SIGNER_REQUEST_TIMEOUT_MS = "10";

    const requestIds: string[] = [];
    let requestCount = 0;

    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        requestCount += 1;
        const parsed = deserializeSignerPayload<SignerCommandRequest>(
          await request.text(),
        );
        requestIds.push(parsed.clientRequestId);

        if (requestCount === 1) {
          await Bun.sleep(50);
        }

        return new Response(
          serializeSignerPayload({
            ok: true,
            txHash: TEST_TX_HASH,
          }),
          {
            headers: {
              "content-type": "application/json",
            },
          },
        );
      },
    });

    try {
      const signer = createWalletPort(
        createRemoteAccount({
          label: "service-wallet",
          address: ZERO_ADDRESS,
          chainId: "eip155:1",
          signerUrl: normalizeSignerUrl(server.url.toString()),
        }),
      );

      const txHash = await signer.signAndSendTransaction("eip155:1", {
        format: "evm-transaction",
        to: ZERO_ADDRESS,
        data: "0x",
      });

      expect(txHash).toBe(TEST_TX_HASH);
      expect(requestCount).toBe(2);
      expect(requestIds[0]).toBeString();
      expect(requestIds[0]).toBe(requestIds[1]);
    } finally {
      await server.stop(true);
    }
  });
});
