import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("wallet create command", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "wooo-wallet-create-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("bootstraps the default wallet when the configured wallet does not exist", async () => {
    writeFileSync(
      join(tempDir, "wooo.config.json"),
      JSON.stringify({
        default: {
          wallet: "main",
          chain: "ethereum",
        },
      }),
    );

    const result = Bun.spawn({
      cmd: [
        "bun",
        "run",
        "src/index.ts",
        "wallet",
        "create",
        "alice",
        "--json",
      ],
      cwd: process.cwd(),
      env: {
        ...process.env,
        WOOO_CONFIG_DIR: tempDir,
        OWS_PASSPHRASE: "test-passphrase",
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
    expect(JSON.parse(stdout)).toBeTruthy();

    const config = JSON.parse(
      readFileSync(join(tempDir, "wooo.config.json"), "utf-8"),
    ) as {
      default?: { wallet?: string };
    };
    expect(config.default?.wallet).toBe("alice");
  });
});
