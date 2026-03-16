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

  test("config set parses booleans and JSON arrays for signer policy", () => {
    const configDir = join(tempDir, "signer-policy-config");

    const autoApproveResult = Bun.spawnSync({
      cmd: [
        "bun",
        "run",
        "src/index.ts",
        "config",
        "set",
        "signerPolicy.agent-wallet.autoApprove",
        "true",
      ],
      cwd: process.cwd(),
      env: {
        ...process.env,
        WOOO_CONFIG_DIR: configDir,
      },
      stderr: "pipe",
      stdout: "pipe",
    });

    const protocolsResult = Bun.spawnSync({
      cmd: [
        "bun",
        "run",
        "src/index.ts",
        "config",
        "set",
        "signerPolicy.agent-wallet.allowProtocols",
        '["uniswap","aave"]',
      ],
      cwd: process.cwd(),
      env: {
        ...process.env,
        WOOO_CONFIG_DIR: configDir,
      },
      stderr: "pipe",
      stdout: "pipe",
    });

    expect(autoApproveResult.exitCode).toBe(0);
    expect(protocolsResult.exitCode).toBe(0);

    const config = JSON.parse(
      readFileSync(join(configDir, "wooo.config.json"), "utf-8"),
    ) as {
      signerPolicy: {
        "agent-wallet": {
          autoApprove: boolean;
          allowProtocols: string[];
        };
      };
    };

    expect(config.signerPolicy["agent-wallet"].autoApprove).toBe(true);
    expect(config.signerPolicy["agent-wallet"].allowProtocols).toEqual([
      "uniswap",
      "aave",
    ]);
  });

  test("config set parses JSON objects for signer policy", () => {
    const configDir = join(tempDir, "signer-policy-object-config");

    const result = Bun.spawnSync({
      cmd: [
        "bun",
        "run",
        "src/index.ts",
        "config",
        "set",
        "signerPolicy.agent-wallet.evm",
        '{"allowChains":["arbitrum"],"approvals":{"denyUnlimited":true}}',
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

    const config = JSON.parse(
      readFileSync(join(configDir, "wooo.config.json"), "utf-8"),
    ) as {
      signerPolicy: {
        "agent-wallet": {
          evm: {
            allowChains: string[];
            approvals: { denyUnlimited: boolean };
          };
        };
      };
    };

    expect(config.signerPolicy["agent-wallet"].evm.allowChains).toEqual([
      "arbitrum",
    ]);
    expect(
      config.signerPolicy["agent-wallet"].evm.approvals.denyUnlimited,
    ).toBe(true);
  });
});
