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

  test("local wallet commands do not expose transport details in JSON output", async () => {
    const env = {
      ...process.env,
      WOOO_CONFIG_DIR: tempDir,
      WOOO_MASTER_PASSWORD: "test-master-password-32-chars-ok!",
    };

    const generateResult = Bun.spawn({
      cmd: [
        "bun",
        "run",
        "src/index.ts",
        "wallet",
        "generate",
        "local-wallet",
        "--json",
      ],
      cwd: process.cwd(),
      env,
      stderr: "pipe",
      stdout: "pipe",
    });

    const [generateStdout, generateStderr, generateExitCode] =
      await Promise.all([
        new Response(generateResult.stdout).text(),
        new Response(generateResult.stderr).text(),
        generateResult.exited,
      ]);

    expect(generateExitCode).toBe(0);
    expect(generateStderr.trim()).toBe("");

    const generatedWallet = JSON.parse(generateStdout) as {
      active: boolean;
      address: string;
      chain: string;
      mode: string;
      name: string;
      transport?: string;
    };

    expect(generatedWallet.name).toBe("local-wallet");
    expect(generatedWallet.mode).toBe("local");
    expect("transport" in generatedWallet).toBe(false);

    const listResult = Bun.spawn({
      cmd: ["bun", "run", "src/index.ts", "wallet", "list", "--json"],
      cwd: process.cwd(),
      env,
      stderr: "pipe",
      stdout: "pipe",
    });

    const [listStdout, listStderr, listExitCode] = await Promise.all([
      new Response(listResult.stdout).text(),
      new Response(listResult.stderr).text(),
      listResult.exited,
    ]);

    expect(listExitCode).toBe(0);
    expect(listStderr.trim()).toBe("");

    const wallets = JSON.parse(listStdout) as Array<{
      active: boolean;
      address: string;
      chain: string;
      mode: string;
      name: string;
      transport?: string;
    }>;

    expect(wallets).toHaveLength(1);
    expect(wallets[0]?.name).toBe("local-wallet");
    expect(wallets[0]?.mode).toBe("local");
    expect(wallets[0]?.active).toBe(true);
    expect("transport" in (wallets[0] ?? {})).toBe(false);
  });

  test("auto-discovers a service wallet from signer metadata", async () => {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch() {
        return new Response(
          JSON.stringify({
            version: 1,
            kind: "wooo-signer-service",
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
        new Response(result.stdout).text(),
        new Response(result.stderr).text(),
        result.exited,
      ]);

      expect(exitCode).toBe(0);
      expect(stderr.trim()).toBe("");

      const output = JSON.parse(stdout) as {
        address: string;
        chain: string;
        mode: string;
        name: string;
        transport: string | null;
      };

      expect(output.name).toBe("service-wallet");
      expect(output.address).toBe(ZERO_ADDRESS);
      expect(output.chain).toBe("evm");
      expect(output.mode).toBe("remote");
      expect(output.transport).toBe("service");
    } finally {
      server.stop(true);
    }
  });
});
