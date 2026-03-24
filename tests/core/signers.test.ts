import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createWallet,
  importWalletPrivateKey,
} from "@open-wallet-standard/core";
import ccxt from "ccxt";
import type { Abi } from "viem";
import {
  deserializeSignerPayload,
  type HttpSignerMetadata,
  type SignerCommandRequest,
  type SignerCommandResponse,
  serializeSignerPayload,
} from "../../src/core/signer-protocol";
import {
  createSigner,
  ExternalSigner,
  fetchSignerMetadata,
  normalizeSignerUrl,
  OwsSigner,
  type ResolvedWallet,
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

describe("signers", () => {
  const originalEnv = {
    OWS_PASSPHRASE: process.env.OWS_PASSPHRASE,
    WOOO_CONFIG_DIR: process.env.WOOO_CONFIG_DIR,
    WOOO_MASTER_PASSWORD: process.env.WOOO_MASTER_PASSWORD,
    WOOO_HTTP_SIGNER_POLL_INTERVAL_MS:
      process.env.WOOO_HTTP_SIGNER_POLL_INTERVAL_MS,
    WOOO_HTTP_SIGNER_TIMEOUT_MS: process.env.WOOO_HTTP_SIGNER_TIMEOUT_MS,
    WOOO_SIGNER_TOKEN: process.env.WOOO_SIGNER_TOKEN,
  };

  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "wooo-signers-test-"));
    process.env.WOOO_CONFIG_DIR = tempDir;
    process.env.OWS_PASSPHRASE = "top-secret";
    process.env.WOOO_MASTER_PASSWORD = "top-secret";
    process.env.WOOO_SIGNER_TOKEN = "signer-token-test";
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

  test("createSigner creates OwsSigner for ows source", () => {
    const wallet: ResolvedWallet = {
      source: "ows",
      name: "my-wallet",
      walletId: "wallet-123",
      address: ZERO_ADDRESS,
      chainId: "eip155:1",
      vaultPath: join(tempDir, "vault"),
    };

    const signer = createSigner(wallet);
    expect(signer).toBeInstanceOf(OwsSigner);
    expect(signer.walletName).toBe("my-wallet");
    expect(signer.address).toBe(ZERO_ADDRESS);
  });

  test("createSigner creates ExternalSigner for external source", () => {
    const wallet: ResolvedWallet = {
      source: "external",
      name: "ext-wallet",
      address: ZERO_ADDRESS,
      chainId: "eip155:1",
      signerUrl: "http://127.0.0.1:8787/",
    };

    const signer = createSigner(wallet);
    expect(signer).toBeInstanceOf(ExternalSigner);
    expect(signer.walletName).toBe("ext-wallet");
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

    const signer = createSigner({
      source: "ows",
      name: walletInfo.name,
      walletId: walletInfo.id,
      address: evmAccount?.address ?? ZERO_ADDRESS,
      chainId: "eip155:1",
      vaultPath,
    });

    const signature = await signer.signTypedData("eip155:1", {
      domain: {
        name: "WoooSigner",
        version: "1",
        chainId: 1,
      },
      types: {
        WoooSigner: [{ name: "wallet", type: "address" }],
      },
      primaryType: "WoooSigner",
      message: {
        wallet: evmAccount?.address ?? ZERO_ADDRESS,
      },
    });
    expect(signature).toMatch(/^(0x)?[0-9a-f]+$/i);
  });

  test("OwsSigner matches ccxt for Hyperliquid L1 action signatures", async () => {
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
    const signer = createSigner({
      source: "ows",
      name: walletInfo.name,
      walletId: walletInfo.id,
      address: evmAccount?.address ?? ZERO_ADDRESS,
      chainId: "eip155:42161",
      vaultPath,
    });

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

    const signature = await signer.signHyperliquidL1Action(request);
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
      const wallet: ResolvedWallet = {
        source: "external",
        name: "service-wallet",
        address: ZERO_ADDRESS,
        chainId: "eip155:1",
        signerUrl: normalizeSignerUrl(server.url.toString()),
      };

      const signer = createSigner(wallet);
      const txHash = await signer.writeContract("eip155:1", {
        address: ZERO_ADDRESS,
        abi: [] as Abi,
        functionName: "approve",
        args: [],
      });

      expect(txHash).toBe(TEST_TX_HASH);
      expect(capturedRequest?.kind).toBe("evm-write-contract");
      expect(capturedRequest?.wallet.name).toBe("service-wallet");
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
      const wallet: ResolvedWallet = {
        source: "external",
        name: "service-wallet",
        address: ZERO_ADDRESS,
        chainId: "eip155:1",
        signerUrl: normalizeSignerUrl(server.url.toString()),
      };

      const signer = createSigner(wallet);
      const txHash = await signer.writeContract("eip155:1", {
        address: ZERO_ADDRESS,
        abi: [] as Abi,
        functionName: "approve",
        args: [],
      });

      expect(txHash).toBe(TEST_TX_HASH);
      expect(capturedRequest?.kind).toBe("evm-write-contract");
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
      const wallet: ResolvedWallet = {
        source: "external",
        name: "service-wallet",
        address: ZERO_ADDRESS,
        chainId: "eip155:1",
        signerUrl: normalizeSignerUrl(server.url.toString()),
      };

      const signer = createSigner(wallet);

      await expect(
        signer.writeContract("eip155:1", {
          address: ZERO_ADDRESS,
          abi: [] as Abi,
          functionName: "approve",
          args: [],
        }),
      ).rejects.toThrow(/timed out/);
    } finally {
      await server.stop(true);
    }
  });

  test("ExternalSigner supports Hyperliquid signatures via a local signer service", async () => {
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
      const wallet: ResolvedWallet = {
        source: "external",
        name: "service-wallet",
        address: ZERO_ADDRESS,
        chainId: "eip155:1",
        signerUrl: normalizeSignerUrl(server.url.toString()),
      };

      const signer = createSigner(wallet);
      const result = await signer.signHyperliquidL1Action({
        action: {
          type: "order",
        },
        nonce: 123,
        context: {
          actionType: "order",
          symbol: "BTC",
        },
      });

      expect(result).toEqual(signature);
      expect(capturedRequest?.kind).toBe("hyperliquid-sign-l1-action");
      expect(capturedRequest?.wallet.name).toBe("service-wallet");
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
      const wallet: ResolvedWallet = {
        source: "external",
        name: "service-wallet",
        address: ZERO_ADDRESS,
        chainId: "eip155:1",
        signerUrl: normalizeSignerUrl(server.url.toString()),
      };

      const signer = createSigner(wallet);
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
      expect(capturedRequest?.kind).toBe("evm-sign-typed-data");
      expect(capturedRequest?.wallet.name).toBe("service-wallet");
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
      const wallet: ResolvedWallet = {
        source: "external",
        name: "signer-wallet",
        address: ZERO_ADDRESS,
        chainId: "eip155:1",
        signerUrl: normalizeSignerUrl(server.url.toString()),
        authEnv: "WOOO_SIGNER_TOKEN",
      };

      const signer = createSigner(wallet);
      const txHash = await signer.writeContract("eip155:1", {
        address: ZERO_ADDRESS,
        abi: [] as Abi,
        functionName: "approve",
        args: [],
      });

      expect(txHash).toBe(TEST_TX_HASH);
      expect(capturedAuthHeader).toBe("Bearer signer-token-test");
      expect(capturedRequest?.kind).toBe("evm-write-contract");
      expect(capturedRequest?.wallet.name).toBe("signer-wallet");
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
          kind: "wooo-signer",
          wallets: [
            {
              address: ZERO_ADDRESS,
              chain: "evm",
            },
          ],
          supportedKinds: ["evm-write-contract"],
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
      expect(metadata.wallets[0]?.address).toBe(ZERO_ADDRESS);
      expect(metadata.supportedKinds).toEqual(["evm-write-contract"]);
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
          kind: "wooo-signer",
          wallets: [
            {
              address: ZERO_ADDRESS,
              chain: "evm",
            },
          ],
          supportedKinds: ["evm-write-contract"],
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
        "WOOO_SIGNER_TOKEN",
      );
      expect(capturedAuthHeader).toBe("Bearer signer-token-test");
      expect(metadata.wallets[0]?.address).toBe(ZERO_ADDRESS);
      expect(metadata.kind).toBe("wooo-signer");
    } finally {
      await server.stop(true);
    }
  });
});
