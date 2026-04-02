import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ensureConfigDir,
  getConfigDir,
  getConfigPath,
  loadWoooConfig,
  loadWoooConfigSync,
} from "../../src/core/config";

describe("getConfigDir", () => {
  const originalEnv = process.env.WOOO_CONFIG_DIR;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.WOOO_CONFIG_DIR;
    } else {
      process.env.WOOO_CONFIG_DIR = originalEnv;
    }
  });

  test("uses WOOO_CONFIG_DIR env when set", () => {
    process.env.WOOO_CONFIG_DIR = "/tmp/custom-wooo";
    expect(getConfigDir()).toBe("/tmp/custom-wooo");
  });

  test("falls back to ~/.config/wooo when env not set", () => {
    delete process.env.WOOO_CONFIG_DIR;
    const result = getConfigDir();
    expect(result).toContain(".config/wooo");
  });
});

describe("loadWoooConfig", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "wooo-config-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("loads config from directory", async () => {
    writeFileSync(
      join(tempDir, "wooo.config.json"),
      JSON.stringify({ default: { chain: "ethereum", wallet: "main" } }),
    );
    const config = await loadWoooConfig(tempDir);
    expect(config.default?.chain).toBe("ethereum");
    expect(config.default?.wallet).toBe("main");
  });

  test("returns defaults when no config file exists", async () => {
    const config = await loadWoooConfig(tempDir);
    expect(config.default).toBeDefined();
    expect(config.default?.chain).toBe("ethereum");
  });

  test("sync loader returns defaults plus overrides", () => {
    writeFileSync(
      join(tempDir, "wooo.config.json"),
      JSON.stringify({
        default: { chain: "arbitrum" },
        chains: { arbitrum: { rpc: "https://example.invalid/arb" } },
      }),
    );
    const config = loadWoooConfigSync(tempDir);
    expect(config.default?.chain).toBe("arbitrum");
    expect(config.default?.wallet).toBe("main");
    expect(config.chains?.arbitrum?.rpc).toBe("https://example.invalid/arb");
    expect(config.chains?.ethereum?.rpc).toBe("https://1rpc.io/eth");
    expect(config.chains?.optimism?.rpc).toBe("https://mainnet.optimism.io");
    expect(config.chains?.polygon?.rpc).toBe(
      "https://polygon-bor-rpc.publicnode.com",
    );
  });

  test("ensureConfigDir creates the target directory", () => {
    const missingDir = join(tempDir, "nested", "config");
    expect(existsSync(missingDir)).toBe(false);
    ensureConfigDir(missingDir);
    expect(existsSync(missingDir)).toBe(true);
    expect(getConfigPath(missingDir)).toBe(
      join(missingDir, "wooo.config.json"),
    );
  });
});
