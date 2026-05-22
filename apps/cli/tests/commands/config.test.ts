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

  test("config set rejects raw secret config keys", () => {
    const configDir = join(tempDir, "secret-config");

    for (const key of ["okx.apiSecret", "wallet.privateKey", "okx.APITOKEN"]) {
      const result = Bun.spawnSync({
        cmd: [
          "bun",
          "run",
          "src/index.ts",
          "config",
          "set",
          key,
          "secret-value",
        ],
        cwd: process.cwd(),
        env: {
          ...process.env,
          WOOO_CONFIG_DIR: configDir,
        },
        stderr: "pipe",
        stdout: "pipe",
      });

      expect(result.exitCode).not.toBe(0);
      expect(new TextDecoder().decode(result.stderr)).toContain(
        "would store a secret value directly",
      );
    }
  });

  test("config set validates secret ref config keys", () => {
    const configDir = join(tempDir, "secret-ref-config");

    const result = Bun.spawnSync({
      cmd: [
        "bun",
        "run",
        "src/index.ts",
        "config",
        "set",
        "okx.apiSecretRef",
        "keychain:okx/api-secret",
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
      okx: { apiSecretRef: string };
    };
    expect(config.okx.apiSecretRef).toBe("keychain:okx/api-secret");
  });

  test("config set preserves known string identifiers", () => {
    const configDir = join(tempDir, "string-id-config");

    const result = Bun.spawnSync({
      cmd: [
        "bun",
        "run",
        "src/index.ts",
        "config",
        "set",
        "okxOnchain.projectId",
        "123456",
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
      okxOnchain: { projectId: string };
    };
    expect(config.okxOnchain.projectId).toBe("123456");
  });
});
