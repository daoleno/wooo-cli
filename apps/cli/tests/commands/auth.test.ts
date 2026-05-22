import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function runCliJson<T>(
  args: string[],
  env?: Record<string, string>,
): Promise<T> {
  const configDir = mkdtempSync(join(tmpdir(), "wooo-auth-command-"));
  try {
    const proc = Bun.spawn({
      cmd: [process.execPath, "run", "src/index.ts", ...args, "--json"],
      cwd: process.cwd(),
      env: {
        ...process.env,
        WOOO_CONFIG_DIR: configDir,
        ...(env ?? {}),
      },
      stderr: "pipe",
      stdout: "pipe",
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    if (exitCode !== 0) {
      throw new Error(
        `Command failed with exit code ${exitCode}: bun run src/index.ts ${args.join(
          " ",
        )}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
      );
    }

    return JSON.parse(stdout) as T;
  } finally {
    rmSync(configDir, { recursive: true, force: true });
  }
}

async function runCli(
  args: string[],
  env?: Record<string, string>,
): Promise<{
  exitCode: number;
  stderr: string;
  stdout: string;
}> {
  const configDir = mkdtempSync(join(tmpdir(), "wooo-auth-command-"));
  try {
    const proc = Bun.spawn({
      cmd: [process.execPath, "run", "src/index.ts", ...args],
      cwd: process.cwd(),
      env: {
        ...process.env,
        WOOO_CONFIG_DIR: configDir,
        ...(env ?? {}),
      },
      stderr: "pipe",
      stdout: "pipe",
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    return { exitCode, stderr, stdout };
  } finally {
    rmSync(configDir, { recursive: true, force: true });
  }
}

describe("auth commands", () => {
  test("auth status reports env-backed credential refs without revealing values", async () => {
    const output = await runCliJson<{
      credentials: Array<{
        field: string;
        present: boolean;
        ref: string;
        source: string;
      }>;
      service: string;
    }>(["auth", "status", "okx"], {
      WOOO_OKX_API_KEY_REF: "env:WOOO_TEST_OKX_API_KEY",
      WOOO_TEST_OKX_API_KEY: "test-key",
      WOOO_OKX_API_SECRET_REF: "env:WOOO_TEST_OKX_API_SECRET",
      WOOO_TEST_OKX_API_SECRET: "test-secret",
      WOOO_OKX_PASSPHRASE_REF: "env:WOOO_TEST_OKX_PASSPHRASE",
      WOOO_TEST_OKX_PASSPHRASE: "test-passphrase",
    });

    expect(output.service).toBe("okx");
    expect(output.credentials).toEqual([
      {
        field: "apiKey",
        label: "OKX API key",
        present: true,
        ref: "env:WOOO_TEST_OKX_API_KEY",
        source: "env",
      },
      {
        field: "apiSecret",
        label: "OKX API secret",
        present: true,
        ref: "env:WOOO_TEST_OKX_API_SECRET",
        source: "env",
      },
      {
        field: "passphrase",
        label: "OKX passphrase",
        present: true,
        ref: "env:WOOO_TEST_OKX_PASSPHRASE",
        source: "env",
      },
    ]);
  });

  test("auth set rejects credential args that do not belong to the service", async () => {
    const result = await runCli([
      "auth",
      "set",
      "lifi",
      "--api-key",
      "test-key",
      "--passphrase",
      "wrong",
    ]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("LI.FI does not use --passphrase");
  });
});
