import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Abi } from "viem";
import {
  deserializeSignerPayload,
  type SignerBrokerMetadata,
  type SignerCommandRequest,
  type SignerCommandResponse,
  type SignerServiceMetadata,
  serializeSignerPayload,
} from "../../src/core/signer-protocol";
import {
  createEvmSigner,
  createSignerChildEnv,
  fetchSignerBrokerMetadata,
  fetchSignerServiceMetadata,
  normalizeSignerBrokerUrl,
  normalizeSignerServiceUrl,
} from "../../src/core/signers";
import type { WalletRecord } from "../../src/core/wallet-store";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const TEST_TX_HASH = `0x${"12".repeat(32)}`;
const TEST_SIGNATURE_HEX = `0x${"78".repeat(65)}`;
const FIXTURE_PATH = join(
  process.cwd(),
  "tests",
  "fixtures",
  "mock-command-signer.ts",
);

describe("signers", () => {
  const originalEnv = {
    WOOO_CONFIG_DIR: process.env.WOOO_CONFIG_DIR,
    WOOO_MASTER_PASSWORD: process.env.WOOO_MASTER_PASSWORD,
    WOOO_SIGNER_CAPTURE_PATH: process.env.WOOO_SIGNER_CAPTURE_PATH,
    WOOO_HTTP_SIGNER_POLL_INTERVAL_MS:
      process.env.WOOO_HTTP_SIGNER_POLL_INTERVAL_MS,
    WOOO_HTTP_SIGNER_TIMEOUT_MS: process.env.WOOO_HTTP_SIGNER_TIMEOUT_MS,
    WOOO_SIGNER_TEST_VALUE: process.env.WOOO_SIGNER_TEST_VALUE,
    WOOO_BROKER_TOKEN: process.env.WOOO_BROKER_TOKEN,
  };

  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "wooo-signers-test-"));
    process.env.WOOO_CONFIG_DIR = tempDir;
    process.env.WOOO_MASTER_PASSWORD = "top-secret";
    process.env.WOOO_SIGNER_TEST_VALUE = "signer-visible";
    process.env.WOOO_SIGNER_CAPTURE_PATH = join(tempDir, "capture.json");
    process.env.WOOO_BROKER_TOKEN = "broker-token-test";
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

  test("createSignerChildEnv strips master password for external wallet transports", () => {
    const env = createSignerChildEnv({
      name: "external",
      address: ZERO_ADDRESS,
      chain: "evm",
      connection: {
        mode: "external",
        transport: "command",
        command: ["bun", "run", FIXTURE_PATH],
      },
    });

    expect(env.WOOO_MASTER_PASSWORD).toBeUndefined();
    expect(env.WOOO_SIGNER_TEST_VALUE).toBe("signer-visible");
    expect(env.WOOO_CONFIG_DIR).toBe(tempDir);
  });

  test("createSignerChildEnv keeps master password for local signer subprocess", () => {
    const env = createSignerChildEnv({
      name: "local",
      address: ZERO_ADDRESS,
      chain: "evm",
      connection: {
        mode: "local",
        keyRef: "wallet:local",
      },
    });

    expect(env.WOOO_MASTER_PASSWORD).toBe("top-secret");
  });

  test("createEvmSigner invokes the external command signer transport contract", async () => {
    const wallet: WalletRecord = {
      name: "external",
      address: ZERO_ADDRESS,
      chain: "evm",
      connection: {
        mode: "external",
        transport: "command",
        command: ["bun", "run", FIXTURE_PATH],
      },
    };

    const signer = createEvmSigner(wallet);
    const txHash = await signer.writeContract("ethereum", {
      address: ZERO_ADDRESS,
      abi: [] as Abi,
      functionName: "approve",
      args: [],
    });

    expect(txHash).toBe(TEST_TX_HASH);

    const capturePath = process.env.WOOO_SIGNER_CAPTURE_PATH;
    expect(capturePath).toBeString();

    const capture = JSON.parse(
      readFileSync(capturePath as string, "utf-8"),
    ) as {
      env: {
        WOOO_CONFIG_DIR: string | null;
        WOOO_MASTER_PASSWORD: string | null;
        WOOO_SIGNER_TEST_VALUE: string | null;
      };
      request: {
        kind: string;
        walletName: string;
      };
    };

    expect(capture.request.kind).toBe("evm-write-contract");
    expect(capture.request.walletName).toBe("external");
    expect(capture.env.WOOO_MASTER_PASSWORD).toBeNull();
    expect(capture.env.WOOO_SIGNER_TEST_VALUE).toBe("signer-visible");
    expect(capture.env.WOOO_CONFIG_DIR).toBe(tempDir);
  });

  test("createEvmSigner invokes typed data signing over the signer transport", async () => {
    const wallet: WalletRecord = {
      name: "external",
      address: ZERO_ADDRESS,
      chain: "evm",
      connection: {
        mode: "external",
        transport: "command",
        command: ["bun", "run", FIXTURE_PATH],
      },
    };

    const signer = createEvmSigner(wallet);
    const signatureHex = await signer.signTypedData(
      "polygon",
      {
        domain: {
          name: "ClobAuthDomain",
          version: "1",
          chainId: 137,
        },
        types: {
          ClobAuth: [
            { name: "address", type: "address" },
            { name: "timestamp", type: "string" },
          ],
        },
        primaryType: "ClobAuth",
        message: {
          address: ZERO_ADDRESS,
          timestamp: "123456",
        },
      },
      {
        origin: {
          group: "prediction",
          protocol: "polymarket",
          command: "auth",
        },
      },
    );

    expect(signatureHex).toBe(TEST_SIGNATURE_HEX);

    const capturePath = process.env.WOOO_SIGNER_CAPTURE_PATH;
    expect(capturePath).toBeString();

    const capture = JSON.parse(
      readFileSync(capturePath as string, "utf-8"),
    ) as {
      request: {
        kind: string;
        walletName: string;
      };
    };

    expect(capture.request.kind).toBe("evm-sign-typed-data");
    expect(capture.request.walletName).toBe("external");
  });

  test("normalizeSignerServiceUrl only allows local HTTP endpoints", () => {
    expect(normalizeSignerServiceUrl("http://127.0.0.1:8787")).toBe(
      "http://127.0.0.1:8787/",
    );
    expect(() =>
      normalizeSignerServiceUrl("https://example.com/signer"),
    ).toThrow(/local host/);
  });

  test("normalizeSignerBrokerUrl allows https remotes and rejects insecure remote http", () => {
    expect(normalizeSignerBrokerUrl("https://broker.example.com/signer")).toBe(
      "https://broker.example.com/signer",
    );
    expect(normalizeSignerBrokerUrl("http://127.0.0.1:8788")).toBe(
      "http://127.0.0.1:8788/",
    );
    expect(() =>
      normalizeSignerBrokerUrl("http://broker.example.com/signer"),
    ).toThrow(/https/);
  });

  test("createEvmSigner invokes a local signer service", async () => {
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
      const wallet: WalletRecord = {
        name: "service-wallet",
        address: ZERO_ADDRESS,
        chain: "evm",
        connection: {
          mode: "external",
          transport: "service",
          url: normalizeSignerServiceUrl(server.url.toString()),
        },
      };

      const signer = createEvmSigner(wallet);
      const txHash = await signer.writeContract("ethereum", {
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

  test("createEvmSigner waits for an async local signer service result", async () => {
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
      const wallet: WalletRecord = {
        name: "service-wallet",
        address: ZERO_ADDRESS,
        chain: "evm",
        connection: {
          mode: "external",
          transport: "service",
          url: normalizeSignerServiceUrl(server.url.toString()),
        },
      };

      const signer = createEvmSigner(wallet);
      const txHash = await signer.writeContract("ethereum", {
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

  test("createEvmSigner times out when an async signer service never completes", async () => {
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
      const wallet: WalletRecord = {
        name: "service-wallet",
        address: ZERO_ADDRESS,
        chain: "evm",
        connection: {
          mode: "external",
          transport: "service",
          url: normalizeSignerServiceUrl(server.url.toString()),
        },
      };

      const signer = createEvmSigner(wallet);

      await expect(
        signer.writeContract("ethereum", {
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

  test("createEvmSigner supports Hyperliquid signatures via a local signer service", async () => {
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
      const wallet: WalletRecord = {
        name: "service-wallet",
        address: ZERO_ADDRESS,
        chain: "evm",
        connection: {
          mode: "external",
          transport: "service",
          url: normalizeSignerServiceUrl(server.url.toString()),
        },
      };

      const signer = createEvmSigner(wallet);
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

  test("createEvmSigner supports typed data signatures via a local signer service", async () => {
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
      const wallet: WalletRecord = {
        name: "service-wallet",
        address: ZERO_ADDRESS,
        chain: "evm",
        connection: {
          mode: "external",
          transport: "service",
          url: normalizeSignerServiceUrl(server.url.toString()),
        },
      };

      const signer = createEvmSigner(wallet);
      const signatureHex = await signer.signTypedData("polygon", {
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

  test("createEvmSigner invokes a broker transport with bearer auth", async () => {
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
      const wallet: WalletRecord = {
        name: "broker-wallet",
        address: ZERO_ADDRESS,
        chain: "evm",
        connection: {
          mode: "external",
          transport: "broker",
          url: normalizeSignerBrokerUrl(server.url.toString()),
          authEnv: "WOOO_BROKER_TOKEN",
        },
      };

      const signer = createEvmSigner(wallet);
      const txHash = await signer.writeContract("ethereum", {
        address: ZERO_ADDRESS,
        abi: [] as Abi,
        functionName: "approve",
        args: [],
      });

      expect(txHash).toBe(TEST_TX_HASH);
      expect(capturedAuthHeader).toBe("Bearer broker-token-test");
      expect(capturedRequest?.kind).toBe("evm-write-contract");
      expect(capturedRequest?.wallet.name).toBe("broker-wallet");
    } finally {
      await server.stop(true);
    }
  });

  test("fetchSignerServiceMetadata loads and validates local service metadata", async () => {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch() {
        const metadata: SignerServiceMetadata = {
          version: 1,
          kind: "wooo-signer-service",
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
      const metadata = await fetchSignerServiceMetadata(server.url.toString());
      expect(metadata.wallets[0]?.address).toBe(ZERO_ADDRESS);
      expect(metadata.supportedKinds).toEqual(["evm-write-contract"]);
    } finally {
      await server.stop(true);
    }
  });

  test("fetchSignerBrokerMetadata loads metadata with bearer auth", async () => {
    let capturedAuthHeader: string | null = null;
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        capturedAuthHeader = request.headers.get("authorization");
        const metadata: SignerBrokerMetadata = {
          version: 1,
          kind: "wooo-wallet-broker",
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
      const metadata = await fetchSignerBrokerMetadata(
        server.url.toString(),
        "WOOO_BROKER_TOKEN",
      );
      expect(capturedAuthHeader).toBe("Bearer broker-token-test");
      expect(metadata.wallets[0]?.address).toBe(ZERO_ADDRESS);
      expect(metadata.kind).toBe("wooo-wallet-broker");
    } finally {
      await server.stop(true);
    }
  });
});
