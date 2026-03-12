import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("config commands", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "wooo-config-command-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("config set creates the config directory when missing", () => {
    const configDir = join(tempDir, "nested-config");
    const result = Bun.spawnSync({
      cmd: [
        "bun",
        "run",
        "src/index.ts",
        "config",
        "set",
        "default.chain",
        "arbitrum",
      ],
      cwd: process.cwd(),
      env: {
        ...process.env,
        WOOO_CONFIG_DIR: configDir,
      },
      stderr: "pipe",
      stdout: "pipe",
    });

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(configDir, "wooo.config.json"))).toBe(true);

    const config = JSON.parse(
      readFileSync(join(configDir, "wooo.config.json"), "utf-8"),
    ) as {
      default: { chain: string };
    };
    expect(config.default.chain).toBe("arbitrum");
  });
});
