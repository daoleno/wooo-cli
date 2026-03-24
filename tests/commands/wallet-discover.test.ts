import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

describe("wallet discover command", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "wooo-wallet-discover-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("returns signer metadata as JSON", async () => {
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
      const proc = Bun.spawn({
        cmd: [
          "bun",
          "run",
          "src/index.ts",
          "wallet",
          "discover",
          "--url",
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
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);

      expect(exitCode).toBe(0);
      expect(stderr.trim()).toBe("");

      const output = JSON.parse(stdout) as {
        kind: string;
        supportedKinds: string[];
        url: string;
        wallets: Array<{ address: string; chain: string }>;
      };

      expect(output.kind).toBe("wooo-signer");
      expect(output.supportedKinds).toEqual(["evm-write-contract"]);
      expect(output.url).toBe(server.url.toString());
      expect(output.wallets).toEqual([
        {
          address: ZERO_ADDRESS,
          chain: "evm",
        },
      ]);
    } finally {
      server.stop(true);
    }
  });

  test("returns signer metadata with auth as JSON", async () => {
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
      const proc = Bun.spawn({
        cmd: [
          "bun",
          "run",
          "src/index.ts",
          "wallet",
          "discover",
          "--url",
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
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);

      expect(exitCode).toBe(0);
      expect(stderr.trim()).toBe("");
      expect(capturedAuthHeader).toBe("Bearer broker-token-test");

      const output = JSON.parse(stdout) as {
        authEnv?: string;
        kind: string;
        url: string;
        wallets: Array<{ address: string; chain: string }>;
      };

      expect(output.kind).toBe("wooo-signer");
      expect(output.authEnv).toBe("WOOO_BROKER_TOKEN");
      expect(output.url).toBe(server.url.toString());
      expect(output.wallets).toEqual([
        {
          address: ZERO_ADDRESS,
          chain: "evm",
        },
      ]);
    } finally {
      server.stop(true);
    }
  });
});
