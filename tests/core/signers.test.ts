import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Abi } from "viem";
import {
  deserializeSignerPayload,
  type SignerCommandRequest,
  type SignerCommandResponse,
  type SignerServiceMetadata,
  serializeSignerPayload,
} from "../../src/core/signer-protocol";
import {
  createEvmSigner,
  createSignerChildEnv,
  fetchSignerServiceMetadata,
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
    WOOO_SIGNER_TEST_VALUE: process.env.WOOO_SIGNER_TEST_VALUE,
  };

  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "wooo-signers-test-"));
    process.env.WOOO_CONFIG_DIR = tempDir;
    process.env.WOOO_MASTER_PASSWORD = "top-secret";
    process.env.WOOO_SIGNER_TEST_VALUE = "signer-visible";
    process.env.WOOO_SIGNER_CAPTURE_PATH = join(tempDir, "capture.json");
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

  test("createSignerChildEnv strips master password for remote signers", () => {
    const env = createSignerChildEnv({
      name: "external",
      address: ZERO_ADDRESS,
      chain: "evm",
      connection: {
        mode: "remote",
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

  test("createEvmSigner invokes the remote signer command transport contract", async () => {
    const wallet: WalletRecord = {
      name: "external",
      address: ZERO_ADDRESS,
      chain: "evm",
      connection: {
        mode: "remote",
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
        mode: "remote",
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
          mode: "remote",
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
          mode: "remote",
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
          mode: "remote",
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
});
