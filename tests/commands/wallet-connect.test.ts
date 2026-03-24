import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

describe("wallet connect command", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "wooo-wallet-connect-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("auto-discovers a wallet from signer metadata", async () => {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch() {
        return new Response(
          JSON.stringify({
            version: 1,
            kind: "wooo-signer",
            wallets: [
              {
                address: ZERO_ADDRESS,
                chain: "evm",
              },
            ],
            supportedKinds: ["evm-write-contract"],
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
      const result = Bun.spawn({
        cmd: [
          "bun",
          "run",
          "src/index.ts",
          "wallet",
          "connect",
          "service-wallet",
          "--broker",
          server.url.toString(),
          "--json",
        ],
        cwd: process.cwd(),
        env: {
          ...process.env,
          WOOO_CONFIG_DIR: tempDir,
        },
        stderr: "pipe",
        stdout: "pipe",
      });

      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(result.stdout).text(),
        new Response(result.stderr).text(),
        result.exited,
      ]);

      expect(exitCode).toBe(0);
      expect(stderr.trim()).toBe("");

      const output = JSON.parse(stdout) as {
        address: string;
        broker: string;
        chain: string;
        name: string;
      };

      expect(output.name).toBe("service-wallet");
      expect(output.address).toBe(ZERO_ADDRESS);
      expect(output.chain).toBe("evm");
      expect(output.broker).toBe(server.url.toString());
    } finally {
      server.stop(true);
    }
  });

  test("auto-discovers a wallet with auth from signer metadata", async () => {
    let capturedAuthHeader: string | null = null;
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        capturedAuthHeader = request.headers.get("authorization");
        return new Response(
          JSON.stringify({
            version: 1,
            kind: "wooo-signer",
            wallets: [
              {
                address: ZERO_ADDRESS,
                chain: "evm",
              },
            ],
            supportedKinds: ["evm-write-contract"],
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
      const result = Bun.spawn({
        cmd: [
          "bun",
          "run",
          "src/index.ts",
          "wallet",
          "connect",
          "broker-wallet",
          "--broker",
          server.url.toString(),
          "--auth-env",
          "WOOO_BROKER_TOKEN",
          "--json",
        ],
        cwd: process.cwd(),
        env: {
          ...process.env,
          WOOO_CONFIG_DIR: tempDir,
          WOOO_BROKER_TOKEN: "broker-token-test",
        },
        stderr: "pipe",
        stdout: "pipe",
      });

      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(result.stdout).text(),
        new Response(result.stderr).text(),
        result.exited,
      ]);

      expect(exitCode).toBe(0);
      expect(stderr.trim()).toBe("");
      expect(capturedAuthHeader).toBe("Bearer broker-token-test");

      const output = JSON.parse(stdout) as {
        address: string;
        broker: string;
        chain: string;
        name: string;
      };

      expect(output.name).toBe("broker-wallet");
      expect(output.address).toBe(ZERO_ADDRESS);
      expect(output.chain).toBe("evm");
      expect(output.broker).toBe(server.url.toString());
    } finally {
      server.stop(true);
    }
  });
});
