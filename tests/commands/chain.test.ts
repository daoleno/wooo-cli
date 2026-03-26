import { describe, expect, test } from "bun:test";

describe("chain command DX", () => {
  test("chain transfer rejects ambiguous native token symbol passed via --token", () => {
    const result = Bun.spawnSync({
      cmd: [
        "bun",
        "run",
        "src/index.ts",
        "chain",
        "transfer",
        "0x1111111111111111111111111111111111111111",
        "0.1",
        "--chain",
        "ethereum",
        "--token",
        "ETH",
      ],
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString().trim()).toBe("");
    expect(result.stderr.toString()).toContain(
      'Token "ETH" is the native asset on ethereum.',
    );
    expect(result.stderr.toString()).toContain("Omit --token to send native ETH");
    expect(result.stderr.toString()).toContain("use WETH explicitly");
  });

  test("chain approve rejects native token symbols with a clear wrapped-token hint", () => {
    const result = Bun.spawnSync({
      cmd: [
        "bun",
        "run",
        "src/index.ts",
        "chain",
        "approve",
        "ETH",
        "0x1111111111111111111111111111111111111111",
        "1",
        "--chain",
        "ethereum",
      ],
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString().trim()).toBe("");
    expect(result.stderr.toString()).toContain(
      'Token "ETH" is the native asset on ethereum and cannot be approved.',
    );
    expect(result.stderr.toString()).toContain("Use WETH explicitly");
  });
});
