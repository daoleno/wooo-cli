import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendSignerAudit } from "../../src/core/signer-audit";
import type { SignerCommandRequest } from "../../src/core/signer-protocol";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const SPENDER_ADDRESS = "0x1111111111111111111111111111111111111111";
const TOKEN_ADDRESS = "0x2222222222222222222222222222222222222222";

describe("appendSignerAudit", () => {
  const originalConfigDir = process.env.WOOO_CONFIG_DIR;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "wooo-signer-audit-"));
    process.env.WOOO_CONFIG_DIR = tempDir;
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    if (originalConfigDir === undefined) {
      delete process.env.WOOO_CONFIG_DIR;
    } else {
      process.env.WOOO_CONFIG_DIR = originalConfigDir;
    }
  });

  test("writes safe EVM request metadata to the signer audit log", () => {
    const request: Extract<
      SignerCommandRequest,
      { kind: "evm-write-contract" }
    > = {
      version: 1,
      kind: "evm-write-contract",
      wallet: {
        name: "audit-wallet",
        address: ZERO_ADDRESS,
        chain: "evm",
        authKind: "local-keystore",
      },
      origin: {
        group: "dex",
        protocol: "uniswap",
        command: "swap",
      },
      chainName: "arbitrum",
      contract: {
        address: SPENDER_ADDRESS,
        abi: [],
        functionName: "approve",
        value: 0n,
      },
      approval: {
        token: TOKEN_ADDRESS,
        spender: SPENDER_ADDRESS,
        amount: 123n,
      },
    };

    appendSignerAudit(request, "approved", true);

    const auditPath = join(tempDir, "signer-audit.jsonl");
    const entry = JSON.parse(readFileSync(auditPath, "utf-8").trim()) as {
      autoApproved: boolean;
      kind: string;
      request: {
        approval: { amount: string; spender: string; token: string };
        chainName: string;
        contract: { address: string; functionName: string; value: string };
      };
    };

    expect(entry.kind).toBe("evm-write-contract");
    expect(entry.autoApproved).toBe(true);
    expect(entry.request.chainName).toBe("arbitrum");
    expect(entry.request.contract.functionName).toBe("approve");
    expect(entry.request.approval.amount).toBe("123");
  });
});
