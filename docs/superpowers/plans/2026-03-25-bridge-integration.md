# Bridge Integration (LI.FI + OKX Bridge) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two bridge aggregator protocols (LI.FI and OKX DEX Cross-Chain) to wooo-cli under `wooo bridge lifi` and `wooo bridge okx`.

**Architecture:** Each bridge is an independent protocol (no shared bridge-base). LI.FI uses `@lifi/sdk` for data fetching. OKX uses direct REST API calls with HMAC-SHA256 signing. Both use the unified WriteOperation flow for transaction execution.

**Tech Stack:** `@lifi/sdk` ^3.16.3, OKX DEX Cross-Chain REST API, Viem, Citty, Bun

**Spec:** `docs/superpowers/specs/2026-03-25-bridge-integration-design.md`

**Important patterns to follow:**
- `WalletPort.signAndSendTransaction(chainId, { format: "evm-transaction", to, data, value?: bigint })` — first arg is CAIP-2 chain ID string, request needs `format: "evm-transaction"`
- `getActiveWallet("evm")` / `getActiveWalletPort("evm")` — takes `ChainFamily` not chain name
- Chain ID resolution: use `resolveChainId()` from `src/core/chain-ids.ts` to get CAIP-2 IDs, extract numeric ID with `parseInt(caip2.split(":")[1])`

---

### Task 1: Install @lifi/sdk dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the package**

Run: `bun add @lifi/sdk`

- [ ] **Step 2: Verify installation**

Run: `bun run type-check`
Expected: PASS (no type errors)

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lockb
git commit -m "chore: add @lifi/sdk dependency"
```

---

### Task 2: LI.FI types

**Files:**
- Create: `src/protocols/lifi/types.ts`
- Test: `tests/protocols/lifi/types.test.ts`

- [ ] **Step 1: Write type validation test**

```typescript
// tests/protocols/lifi/types.test.ts
import { describe, expect, test } from "bun:test";
import type {
  LifiQuote,
  LifiStatus,
  LifiBridgeResult,
} from "../../../src/protocols/lifi/types";

describe("lifi types", () => {
  test("LifiQuote shape is valid", () => {
    const quote: LifiQuote = {
      fromChain: "ethereum",
      toChain: "arbitrum",
      fromToken: "USDC",
      toToken: "USDC",
      fromAmount: "100000000",
      toAmount: "99800000",
      bridgeName: "stargate",
      fees: { total: "0.20", gas: "0.15", bridge: "0.05" },
      estimatedTime: 120,
      transactionRequest: { to: "0x1234", data: "0x5678", value: "0", gasLimit: "200000" },
    };
    expect(quote.fromChain).toBe("ethereum");
    expect(quote.transactionRequest.to).toBe("0x1234");
  });

  test("LifiStatus shape is valid", () => {
    const status: LifiStatus = {
      status: "DONE",
      substatus: "COMPLETED",
      fromChain: "ethereum",
      toChain: "arbitrum",
      txHash: "0xabc",
      bridgeName: "stargate",
    };
    expect(status.status).toBe("DONE");
    expect(status.substatus).toBe("COMPLETED");
  });

  test("LifiBridgeResult shape is valid", () => {
    const result: LifiBridgeResult = {
      txHash: "0xabc",
      fromChain: "ethereum",
      toChain: "arbitrum",
      fromToken: "USDC",
      toToken: "USDC",
      fromAmount: "100000000",
      estimatedToAmount: "99800000",
    };
    expect(result.txHash).toBe("0xabc");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/protocols/lifi/types.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create types file**

```typescript
// src/protocols/lifi/types.ts
export interface LifiTransactionRequest {
  to: string;
  data: string;
  value: string;
  gasLimit: string;
  gasPrice?: string;
}

export interface LifiQuote {
  fromChain: string;
  toChain: string;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
  bridgeName: string;
  fees: {
    total: string;
    gas: string;
    bridge: string;
  };
  estimatedTime: number;
  transactionRequest: LifiTransactionRequest;
  approvalAddress?: string;
}

export type LifiStatusValue = "PENDING" | "DONE" | "FAILED" | "NOT_FOUND";
export type LifiSubstatus = "COMPLETED" | "PARTIAL" | "REFUNDED" | null;

export interface LifiStatus {
  status: LifiStatusValue;
  substatus: LifiSubstatus;
  fromChain: string;
  toChain: string;
  txHash: string;
  bridgeName: string;
  toAmount?: string;
}

export interface LifiBridgeResult {
  txHash: string;
  fromChain: string;
  toChain: string;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  estimatedToAmount: string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/protocols/lifi/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/protocols/lifi/types.ts tests/protocols/lifi/types.test.ts
git commit -m "feat(lifi): add LI.FI bridge types"
```

---

### Task 3: LI.FI client

**Files:**
- Create: `src/protocols/lifi/client.ts`
- Test: `tests/protocols/lifi/client.test.ts`

The client wraps `@lifi/sdk` functions and maps responses to our types. Tests mock the SDK.

- [ ] **Step 1: Write failing client test**

```typescript
// tests/protocols/lifi/client.test.ts
import { describe, expect, test, mock, beforeEach } from "bun:test";

// Mock @lifi/sdk before importing client
mock.module("@lifi/sdk", () => ({
  createConfig: mock(() => {}),
  getQuote: mock(async () => ({
    action: { fromChainId: 1, toChainId: 42161, fromToken: { symbol: "USDC" }, toToken: { symbol: "USDC" } },
    estimate: {
      toAmount: "99800000",
      executionDuration: 120,
      gasCosts: [{ amountUSD: "0.15" }],
      feeCosts: [{ amountUSD: "0.05" }],
    },
    tool: "stargate",
    transactionRequest: { to: "0x1234", data: "0x5678", value: "0", gasLimit: "200000" },
    action: { fromChainId: 1, toChainId: 42161, fromToken: { symbol: "USDC", address: "0xA0b8" }, toToken: { symbol: "USDC", address: "0xaf88" }, fromAmount: "100000000" },
  })),
  getStatus: mock(async () => ({
    status: "DONE",
    substatus: "COMPLETED",
    sending: { chainId: 1, txHash: "0xabc" },
    receiving: { chainId: 42161, txHash: "0xdef" },
    tool: "stargate",
    toAmount: "99800000",
  })),
  getChains: mock(async () => [
    { id: 1, key: "eth", name: "Ethereum", chainType: "EVM" },
    { id: 42161, key: "arb", name: "Arbitrum", chainType: "EVM" },
  ]),
  getTokens: mock(async () => ({
    tokens: {
      1: [{ symbol: "USDC", address: "0xA0b8", decimals: 6 }],
      42161: [{ symbol: "USDC", address: "0xaf88", decimals: 6 }],
    },
  })),
  ChainId: { ETH: 1, ARB: 42161 },
}));

import { LifiClient } from "../../../src/protocols/lifi/client";

describe("LifiClient", () => {
  const client = new LifiClient();

  test("getQuote returns mapped LifiQuote", async () => {
    const quote = await client.getQuote({
      fromChain: 1,
      toChain: 42161,
      fromToken: "0xA0b8",
      toToken: "0xaf88",
      fromAmount: "100000000",
      fromAddress: "0xuser",
    });
    expect(quote.fromChain).toBeDefined();
    expect(quote.toAmount).toBeDefined();
    expect(quote.transactionRequest.to).toBe("0x1234");
    expect(quote.bridgeName).toBe("stargate");
  });

  test("getStatus returns mapped LifiStatus", async () => {
    const status = await client.getStatus("0xabc", "stargate", 1, 42161);
    expect(status.status).toBe("DONE");
    expect(status.substatus).toBe("COMPLETED");
  });

  test("getChains returns chain list", async () => {
    const chains = await client.getChains();
    expect(chains.length).toBe(2);
    expect(chains[0].name).toBe("Ethereum");
  });

  test("getTokens returns token map", async () => {
    const tokens = await client.getTokens([1, 42161]);
    expect(tokens[1]).toBeDefined();
    expect(tokens[1][0].symbol).toBe("USDC");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/protocols/lifi/client.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement LifiClient**

```typescript
// src/protocols/lifi/client.ts
import {
  createConfig,
  getQuote as sdkGetQuote,
  getStatus as sdkGetStatus,
  getChains as sdkGetChains,
  getTokens as sdkGetTokens,
} from "@lifi/sdk";
import type { LifiQuote, LifiStatus } from "./types";

// Initialize SDK once
createConfig({
  integrator: "wooo-cli",
  apiKey: process.env.WOOO_LIFI_API_KEY,
});

export interface LifiQuoteParams {
  fromChain: number;
  toChain: number;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  fromAddress: string;
  slippage?: number;
}

export class LifiClient {
  async getQuote(params: LifiQuoteParams): Promise<LifiQuote> {
    const result = await sdkGetQuote({
      fromChain: params.fromChain,
      toChain: params.toChain,
      fromToken: params.fromToken,
      toToken: params.toToken,
      fromAmount: params.fromAmount,
      fromAddress: params.fromAddress,
      slippage: params.slippage ?? 0.005,
    });

    const gasCost = result.estimate?.gasCosts
      ?.reduce((sum: number, c: { amountUSD?: string }) => sum + Number(c.amountUSD ?? 0), 0)
      .toFixed(2) ?? "0";
    const bridgeFee = result.estimate?.feeCosts
      ?.reduce((sum: number, c: { amountUSD?: string }) => sum + Number(c.amountUSD ?? 0), 0)
      .toFixed(2) ?? "0";
    const totalFee = (Number(gasCost) + Number(bridgeFee)).toFixed(2);

    return {
      fromChain: String(result.action.fromChainId),
      toChain: String(result.action.toChainId),
      fromToken: result.action.fromToken.symbol,
      toToken: result.action.toToken.symbol,
      fromAmount: result.action.fromAmount,
      toAmount: result.estimate.toAmount,
      bridgeName: result.tool,
      fees: { total: totalFee, gas: gasCost, bridge: bridgeFee },
      estimatedTime: result.estimate.executionDuration,
      transactionRequest: {
        to: result.transactionRequest!.to as string,
        data: result.transactionRequest!.data as string,
        value: String(result.transactionRequest!.value ?? "0"),
        gasLimit: String(result.transactionRequest!.gasLimit ?? "0"),
        gasPrice: result.transactionRequest!.gasPrice
          ? String(result.transactionRequest!.gasPrice)
          : undefined,
      },
      approvalAddress: result.estimate?.approvalAddress,
    };
  }

  async getStatus(
    txHash: string,
    bridge: string,
    fromChain: number,
    toChain: number,
  ): Promise<LifiStatus> {
    const result = await sdkGetStatus({ txHash, bridge, fromChain, toChain });
    return {
      status: result.status as LifiStatus["status"],
      substatus: (result.substatus as LifiStatus["substatus"]) ?? null,
      fromChain: String(fromChain),
      toChain: String(toChain),
      txHash,
      bridgeName: result.tool ?? bridge,
      toAmount: result.toAmount,
    };
  }

  async getChains(chainTypes?: string[]): Promise<Array<{ id: number; key: string; name: string; chainType: string }>> {
    const options = chainTypes ? { chainTypes: chainTypes as any } : undefined;
    const chains = await sdkGetChains(options);
    return chains.map((c: any) => ({
      id: c.id,
      key: c.key,
      name: c.name,
      chainType: c.chainType,
    }));
  }

  async getTokens(chains?: number[]): Promise<Record<number, Array<{ symbol: string; address: string; decimals: number }>>> {
    const result = await sdkGetTokens(chains ? { chains } : undefined);
    const mapped: Record<number, Array<{ symbol: string; address: string; decimals: number }>> = {};
    const tokens = (result as any).tokens ?? result;
    for (const [chainId, tokenList] of Object.entries(tokens)) {
      mapped[Number(chainId)] = (tokenList as any[]).map((t) => ({
        symbol: t.symbol,
        address: t.address,
        decimals: t.decimals,
      }));
    }
    return mapped;
  }
}
```

Note: The SDK types may differ slightly across versions. The `as any` casts handle version variance — adjust to exact types once installed. The key contract is our `LifiQuote`/`LifiStatus` output types.

- [ ] **Step 4: Run tests**

Run: `bun test tests/protocols/lifi/client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/protocols/lifi/client.ts tests/protocols/lifi/client.test.ts
git commit -m "feat(lifi): add LI.FI client wrapping @lifi/sdk"
```

---

### Task 4: LI.FI operations (WriteOperation)

**Files:**
- Create: `src/protocols/lifi/operations.ts`
- Test: `tests/protocols/lifi/operations.test.ts`

- [ ] **Step 1: Write failing operation test**

```typescript
// tests/protocols/lifi/operations.test.ts
import { describe, expect, test, mock, beforeEach } from "bun:test";

// Mock the lifi client
mock.module("../../../src/protocols/lifi/client", () => ({
  LifiClient: class {
    async getQuote() {
      return {
        fromChain: "ethereum",
        toChain: "arbitrum",
        fromToken: "USDC",
        toToken: "USDC",
        fromAmount: "100000000",
        toAmount: "99800000",
        bridgeName: "stargate",
        fees: { total: "0.20", gas: "0.15", bridge: "0.05" },
        estimatedTime: 120,
        transactionRequest: { to: "0x1234", data: "0x5678", value: "0", gasLimit: "200000" },
      };
    }
  },
}));

// Mock context
mock.module("../../../src/core/context", () => ({
  getActiveWalletPort: mock(async () => ({ signAndSendTransaction: mock() })),
  getActiveWallet: mock(async () => ({ address: "0xuser" })),
}));

import { createLifiBridgeOperation } from "../../../src/protocols/lifi/operations";

describe("createLifiBridgeOperation", () => {
  const op = createLifiBridgeOperation({
    fromChain: "ethereum",
    toChain: "arbitrum",
    fromToken: "USDC",
    toToken: "USDC",
    amount: 100,
  });

  test("protocol is lifi", () => {
    expect(op.protocol).toBe("lifi");
  });

  test("prepare returns quote data", async () => {
    const prepared = await op.prepare();
    expect(prepared.quote).toBeDefined();
    expect(prepared.quote.toAmount).toBe("99800000");
    expect(prepared.quote.bridgeName).toBe("stargate");
  });

  test("createPreview returns action string", async () => {
    const prepared = await op.prepare();
    const preview = op.createPreview(prepared);
    expect(preview.action).toContain("USDC");
    expect(preview.action).toContain("bridge");
  });

  test("createPlan returns execution plan with bridge group", async () => {
    const prepared = await op.prepare();
    const plan = op.createPlan(prepared);
    expect(plan.operation.group).toBe("bridge");
    expect(plan.operation.protocol).toBe("lifi");
    expect(plan.operation.command).toBe("bridge");
    expect(plan.chain).toBe("ethereum");
    expect(plan.metadata?.destinationChain).toBe("arbitrum");
    expect(plan.steps.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/protocols/lifi/operations.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement operations**

```typescript
// src/protocols/lifi/operations.ts
import { getActiveWallet, getActiveWalletPort } from "../../core/context";
import { resolveChainId } from "../../core/chain-ids";
import {
  createApprovalStep,
  createExecutionPlan,
  createTransactionStep,
  type ExecutionPlanStep,
} from "../../core/execution-plan";
import type { WalletPort } from "../../core/signers";
import type { WriteOperation } from "../../core/write-operation";
import { LifiClient } from "./client";
import type { LifiBridgeResult, LifiQuote } from "./types";

export interface LifiBridgeParams {
  fromChain: string;
  toChain: string;
  fromToken: string;
  toToken: string;
  amount: number;
}

export interface PreparedLifiBridge extends LifiBridgeParams {
  quote: LifiQuote;
  fromAddress: string;
  fromChainId: string; // CAIP-2
}

/** Extract numeric EVM chain ID from CAIP-2 string (e.g. "eip155:1" → 1) */
export function getEvmChainNumber(chainName: string): number {
  const caip2 = resolveChainId(chainName);
  return Number.parseInt(caip2.split(":")[1], 10);
}

export function createLifiBridgeOperation(
  params: LifiBridgeParams,
): WriteOperation<PreparedLifiBridge, WalletPort, LifiBridgeResult> {
  return {
    protocol: "lifi",
    prepare: async () => {
      const wallet = await getActiveWallet("evm");
      const client = new LifiClient();
      const fromChainNum = getEvmChainNumber(params.fromChain);
      const toChainNum = getEvmChainNumber(params.toChain);
      const fromChainId = resolveChainId(params.fromChain);
      const quote = await client.getQuote({
        fromChain: fromChainNum,
        toChain: toChainNum,
        fromToken: params.fromToken,
        toToken: params.toToken,
        fromAmount: String(params.amount),
        fromAddress: wallet.address,
      });
      return { ...params, quote, fromAddress: wallet.address, fromChainId };
    },
    createPreview: (prepared) => ({
      action: `Bridge ${prepared.amount} ${prepared.fromToken} from ${prepared.fromChain} to ${prepared.toChain} via LI.FI (${prepared.quote.bridgeName})`,
      details: {
        from: `${prepared.fromToken} on ${prepared.fromChain}`,
        to: `${prepared.toToken} on ${prepared.toChain}`,
        estimatedOutput: prepared.quote.toAmount,
        fees: `$${prepared.quote.fees.total} (gas: $${prepared.quote.fees.gas}, bridge: $${prepared.quote.fees.bridge})`,
        estimatedTime: `${prepared.quote.estimatedTime}s`,
        bridge: prepared.quote.bridgeName,
      },
    }),
    createPlan: (prepared) => {
      const steps: ExecutionPlanStep[] = [];

      if (prepared.quote.approvalAddress) {
        steps.push(
          createApprovalStep("Approve bridge contract", {
            token: prepared.fromToken,
            amount: prepared.amount,
            spender: prepared.quote.approvalAddress,
          }),
        );
      }

      steps.push(
        createTransactionStep("Submit bridge transaction", {
          from: `${prepared.fromToken} on ${prepared.fromChain}`,
          to: `${prepared.toToken} on ${prepared.toChain}`,
          bridge: prepared.quote.bridgeName,
          estimatedOutput: prepared.quote.toAmount,
        }),
      );

      return createExecutionPlan({
        summary: `Bridge ${prepared.amount} ${prepared.fromToken} from ${prepared.fromChain} to ${prepared.toChain} via LI.FI`,
        group: "bridge",
        protocol: "lifi",
        command: "bridge",
        chain: prepared.fromChain,
        accountType: "evm",
        steps,
        metadata: {
          destinationChain: prepared.toChain,
          estimatedTime: prepared.quote.estimatedTime,
          bridgeName: prepared.quote.bridgeName,
        },
      });
    },
    resolveAuth: async () => await getActiveWalletPort("evm"),
    execute: async (prepared, signer) => {
      const txHash = await signer.signAndSendTransaction(
        prepared.fromChainId,
        {
          format: "evm-transaction",
          to: prepared.quote.transactionRequest.to as `0x${string}`,
          data: prepared.quote.transactionRequest.data as `0x${string}`,
          value: prepared.quote.transactionRequest.value
            ? BigInt(prepared.quote.transactionRequest.value)
            : undefined,
        },
      );
      return {
        txHash: String(txHash),
        fromChain: prepared.fromChain,
        toChain: prepared.toChain,
        fromToken: prepared.fromToken,
        toToken: prepared.toToken,
        fromAmount: String(prepared.amount),
        estimatedToAmount: prepared.quote.toAmount,
      };
    },
  };
}
```

- [ ] **Step 4: Run tests**

Run: `bun test tests/protocols/lifi/operations.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/protocols/lifi/operations.ts tests/protocols/lifi/operations.test.ts
git commit -m "feat(lifi): add bridge WriteOperation"
```

---

### Task 5: LI.FI commands + registry

**Files:**
- Create: `src/protocols/lifi/commands.ts`
- Modify: `src/protocols/registry.ts`
- Modify: `tests/protocols/registry.test.ts`

- [ ] **Step 1: Update registry test to expect lifi in bridge group**

In `tests/protocols/registry.test.ts`, update:

```typescript
// Change line 74:
// expect(groups.bridge).toEqual([]);
// To:
expect(groups.bridge.map((p) => p.name)).toEqual(["lifi"]);
```

Also update the `listProtocols` name array (line 12-26) to include `"lifi"` at the end.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/protocols/registry.test.ts`
Expected: FAIL — lifi not in registry

- [ ] **Step 3: Create commands.ts**

```typescript
// src/protocols/lifi/commands.ts
import { defineCommand } from "citty";
import { evmChainArg, isEvmChain, normalizeChainName } from "../../core/chain-ids";
import { getActiveWallet } from "../../core/context";
import { createOutput, resolveOutputOptions } from "../../core/output";
import { validateAmount, validateTokenSymbol } from "../../core/validation";
import { runWriteOperation } from "../../core/write-operation";
import type { ProtocolDefinition } from "../types";
import { LifiClient } from "./client";
import { createLifiBridgeOperation, getEvmChainNumber } from "./operations";

const EVM_CHAINS = ["ethereum", "arbitrum", "optimism", "polygon", "base", "bsc", "avalanche"];

function validateEvmBridgeChain(value: string, label: string): string {
  const chain = normalizeChainName(value);
  if (!isEvmChain(chain)) {
    console.error(`Error: Only EVM chains are supported for bridging in this version. Got: ${value}`);
    process.exit(1);
  }
  return chain;
}

const bridge = defineCommand({
  meta: { name: "bridge", description: "Bridge tokens cross-chain via LI.FI" },
  args: {
    token: { type: "positional", description: "Token to bridge (e.g. USDC, ETH)", required: true },
    to: { type: "string", description: "Destination token (defaults to same as source)", required: false },
    amount: { type: "positional", description: "Amount to bridge", required: true },
    "from-chain": evmChainArg("ethereum"),
    "to-chain": { type: "string", description: "Destination chain", required: true },
    yes: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const fromToken = validateTokenSymbol(args.token);
    const toToken = args.to ? validateTokenSymbol(args.to) : fromToken;
    const amount = validateAmount(args.amount, "Bridge amount");
    const fromChain = validateEvmBridgeChain(args["from-chain"], "Source chain");
    const toChain = validateEvmBridgeChain(args["to-chain"], "Destination chain");

    await runWriteOperation(
      args,
      createLifiBridgeOperation({ fromChain, toChain, fromToken, toToken, amount }),
      {
        formatResult: (result) => ({
          ...result,
          message: `Bridge submitted. Track status: wooo bridge lifi status ${result.txHash} --from-chain ${fromChain} --to-chain ${toChain}`,
        }),
      },
    );
  },
});

const quote = defineCommand({
  meta: { name: "quote", description: "Get a bridge quote without executing" },
  args: {
    token: { type: "positional", description: "Token to bridge", required: true },
    to: { type: "string", description: "Destination token", required: false },
    amount: { type: "positional", description: "Amount to bridge", required: true },
    "from-chain": evmChainArg("ethereum"),
    "to-chain": { type: "string", description: "Destination chain", required: true },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));
    const fromToken = validateTokenSymbol(args.token);
    const toToken = args.to ? validateTokenSymbol(args.to) : fromToken;
    const amount = validateAmount(args.amount, "Quote amount");
    const fromChain = validateEvmBridgeChain(args["from-chain"], "Source chain");
    const toChain = validateEvmBridgeChain(args["to-chain"], "Destination chain");

    const wallet = await getActiveWallet("evm");
    const client = new LifiClient();

    const result = await client.getQuote({
      fromChain: getEvmChainNumber(fromChain),
      toChain: getEvmChainNumber(toChain),
      fromToken,
      toToken,
      fromAmount: String(amount),
      fromAddress: wallet.address,
    });
    out.data(result);
  },
});

const status = defineCommand({
  meta: { name: "status", description: "Check bridge transaction status" },
  args: {
    txHash: { type: "positional", description: "Transaction hash to check", required: true },
    "from-chain": evmChainArg("ethereum"),
    "to-chain": { type: "string", description: "Destination chain", required: true },
    bridge: { type: "string", description: "Bridge name (optional)", required: false },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));
    const fromChain = validateEvmBridgeChain(args["from-chain"], "Source chain");
    const toChain = validateEvmBridgeChain(args["to-chain"], "Destination chain");

    const client = new LifiClient();
    const result = await client.getStatus(
      args.txHash,
      args.bridge ?? undefined,
      getEvmChainNumber(fromChain),
      getEvmChainNumber(toChain),
    );
    out.data(result);
  },
});

const chains = defineCommand({
  meta: { name: "chains", description: "List supported chains" },
  args: {
    tokens: { type: "boolean", description: "Include supported tokens", default: false },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));
    const client = new LifiClient();
    const chainList = await client.getChains(["EVM"]);

    if (args.tokens) {
      const chainIds = chainList.map((c) => c.id);
      const tokens = await client.getTokens(chainIds);
      out.data({ chains: chainList, tokens });
    } else {
      out.data({ chains: chainList });
    }
  },
});

export const lifiProtocol: ProtocolDefinition = {
  name: "lifi",
  displayName: "LI.FI Bridge Aggregator",
  type: "bridge",
  writeAccountType: "evm",
  setup: () =>
    defineCommand({
      meta: { name: "lifi", description: "LI.FI Bridge Aggregator" },
      subCommands: {
        bridge: () => Promise.resolve(bridge),
        quote: () => Promise.resolve(quote),
        status: () => Promise.resolve(status),
        chains: () => Promise.resolve(chains),
      },
    }),
};
```

- [ ] **Step 4: Register in registry.ts**

Add to `src/protocols/registry.ts`:
- Import: `import { lifiProtocol } from "./lifi/commands";`
- Add `lifiProtocol` to the `protocols` array with a `// Bridge` comment

- [ ] **Step 5: Run registry tests**

Run: `bun test tests/protocols/registry.test.ts`
Expected: PASS

- [ ] **Step 6: Run type-check**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/protocols/lifi/commands.ts src/protocols/registry.ts tests/protocols/registry.test.ts
git commit -m "feat(lifi): add LI.FI bridge commands and register protocol"
```

---

### Task 6: OKX Bridge types

**Files:**
- Create: `src/protocols/okx-bridge/types.ts`
- Test: `tests/protocols/okx-bridge/types.test.ts`

- [ ] **Step 1: Write type test**

```typescript
// tests/protocols/okx-bridge/types.test.ts
import { describe, expect, test } from "bun:test";
import type {
  OkxBridgeQuote,
  OkxBridgeStatus,
  OkxBridgeResult,
} from "../../../src/protocols/okx-bridge/types";

describe("okx-bridge types", () => {
  test("OkxBridgeQuote shape", () => {
    const quote: OkxBridgeQuote = {
      fromChainId: "1",
      toChainId: "42161",
      fromToken: { symbol: "USDC", address: "0xA0b8", decimals: 6 },
      toToken: { symbol: "USDC", address: "0xaf88", decimals: 6 },
      fromAmount: "100000000",
      toAmount: "99800000",
      bridgeName: "across",
      estimatedGas: "200000",
      tx: { to: "0x1234", data: "0x5678", value: "0" },
    };
    expect(quote.bridgeName).toBe("across");
  });

  test("OkxBridgeStatus shape", () => {
    const status: OkxBridgeStatus = {
      status: "SUCCESS",
      fromChainId: "1",
      toChainId: "42161",
      txHash: "0xabc",
      bridgeName: "across",
    };
    expect(status.status).toBe("SUCCESS");
  });

  test("OkxBridgeResult shape", () => {
    const result: OkxBridgeResult = {
      txHash: "0xabc",
      fromChainId: "1",
      toChainId: "42161",
      fromToken: "USDC",
      toToken: "USDC",
      fromAmount: "100000000",
      estimatedToAmount: "99800000",
    };
    expect(result.txHash).toBe("0xabc");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/protocols/okx-bridge/types.test.ts`
Expected: FAIL

- [ ] **Step 3: Create types**

```typescript
// src/protocols/okx-bridge/types.ts
export interface OkxBridgeToken {
  symbol: string;
  address: string;
  decimals: number;
}

export interface OkxBridgeTx {
  to: string;
  data: string;
  value: string;
  gasPrice?: string;
}

export interface OkxBridgeQuote {
  fromChainId: string;
  toChainId: string;
  fromToken: OkxBridgeToken;
  toToken: OkxBridgeToken;
  fromAmount: string;
  toAmount: string;
  bridgeName: string;
  estimatedGas: string;
  tx: OkxBridgeTx;
  needApproval?: boolean;
  approveTo?: string;
}

export type OkxBridgeStatusValue = "PENDING" | "SUCCESS" | "FAIL" | "REFUNDED";

export interface OkxBridgeStatus {
  status: OkxBridgeStatusValue;
  fromChainId: string;
  toChainId: string;
  txHash: string;
  bridgeName: string;
  sourceChainGasfee?: string;
  destinationChainGasfee?: string;
  crossChainFee?: string;
}

export interface OkxBridgeResult {
  txHash: string;
  fromChainId: string;
  toChainId: string;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  estimatedToAmount: string;
}
```

- [ ] **Step 4: Run test**

Run: `bun test tests/protocols/okx-bridge/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/protocols/okx-bridge/types.ts tests/protocols/okx-bridge/types.test.ts
git commit -m "feat(okx-bridge): add OKX bridge types"
```

---

### Task 7: OKX Bridge client (REST API + HMAC signing)

**Files:**
- Create: `src/protocols/okx-bridge/client.ts`
- Test: `tests/protocols/okx-bridge/client.test.ts`

This is the most complex task — the client implements HMAC-SHA256 request signing and wraps the OKX DEX cross-chain REST API.

- [ ] **Step 1: Write HMAC signing test**

```typescript
// tests/protocols/okx-bridge/client.test.ts
import { describe, expect, test, mock, beforeEach } from "bun:test";
import { createOkxSignatureHeaders } from "../../../src/protocols/okx-bridge/client";

describe("OKX HMAC signing", () => {
  test("createOkxSignatureHeaders produces required headers", () => {
    const headers = createOkxSignatureHeaders({
      method: "GET",
      requestPath: "/api/v5/dex/cross-chain/quote",
      queryString: "fromChainId=1&toChainId=42161",
      apiKey: "test-key",
      secretKey: "test-secret",
      passphrase: "test-pass",
      projectId: "test-project",
    });
    expect(headers["OK-ACCESS-KEY"]).toBe("test-key");
    expect(headers["OK-ACCESS-PASSPHRASE"]).toBe("test-pass");
    expect(headers["OK-ACCESS-PROJECT"]).toBe("test-project");
    expect(headers["OK-ACCESS-SIGN"]).toBeDefined();
    expect(headers["OK-ACCESS-TIMESTAMP"]).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/protocols/okx-bridge/client.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement client with HMAC signing**

```typescript
// src/protocols/okx-bridge/client.ts
import { createHmac } from "node:crypto";
import type { OkxBridgeQuote, OkxBridgeStatus } from "./types";

const BASE_URL = "https://web3.okx.com";

interface OkxApiAuth {
  apiKey: string;
  secretKey: string;
  passphrase: string;
  projectId: string;
}

interface SignatureParams extends OkxApiAuth {
  method: string;
  requestPath: string;
  queryString?: string;
}

export function createOkxSignatureHeaders(params: SignatureParams): Record<string, string> {
  const timestamp = new Date().toISOString();
  const preSign = `${timestamp}${params.method}${params.requestPath}${params.queryString ? `?${params.queryString}` : ""}`;
  const sign = createHmac("sha256", params.secretKey).update(preSign).digest("base64");
  return {
    "OK-ACCESS-KEY": params.apiKey,
    "OK-ACCESS-SIGN": sign,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": params.passphrase,
    "OK-ACCESS-PROJECT": params.projectId,
    "Content-Type": "application/json",
  };
}

function resolveAuth(): OkxApiAuth {
  const apiKey = process.env.WOOO_OKX_API_KEY;
  const secretKey = process.env.WOOO_OKX_API_SECRET;
  const passphrase = process.env.WOOO_OKX_PASSPHRASE;
  const projectId = process.env.WOOO_OKX_PROJECT_ID;
  if (!apiKey || !secretKey || !passphrase || !projectId) {
    throw new Error(
      "OKX Bridge requires WOOO_OKX_API_KEY, WOOO_OKX_API_SECRET, WOOO_OKX_PASSPHRASE, and WOOO_OKX_PROJECT_ID environment variables",
    );
  }
  return { apiKey, secretKey, passphrase, projectId };
}

export class OkxBridgeClient {
  private auth: OkxApiAuth;

  constructor(auth?: OkxApiAuth) {
    this.auth = auth ?? resolveAuth();
  }

  private async request<T>(method: string, path: string, params?: Record<string, string>): Promise<T> {
    const queryString = params ? new URLSearchParams(params).toString() : "";
    const headers = createOkxSignatureHeaders({
      ...this.auth,
      method,
      requestPath: path,
      queryString,
    });
    const url = `${BASE_URL}${path}${queryString ? `?${queryString}` : ""}`;
    const response = await fetch(url, { method, headers });
    if (!response.ok) {
      throw new Error(`OKX API error: ${response.status} ${response.statusText}`);
    }
    const json = (await response.json()) as { code: string; msg: string; data: T };
    if (json.code !== "0") {
      throw new Error(`OKX API error: ${json.msg} (code: ${json.code})`);
    }
    return json.data;
  }

  async getQuote(params: {
    fromChainId: string;
    toChainId: string;
    fromTokenAddress: string;
    toTokenAddress: string;
    amount: string;
    slippage?: string;
    userWalletAddress: string;
  }): Promise<OkxBridgeQuote> {
    const data = await this.request<any[]>("GET", "/api/v5/dex/cross-chain/quote", {
      fromChainId: params.fromChainId,
      toChainId: params.toChainId,
      fromTokenAddress: params.fromTokenAddress,
      toTokenAddress: params.toTokenAddress,
      amount: params.amount,
      slippage: params.slippage ?? "0.005",
      userWalletAddress: params.userWalletAddress,
    });
    const route = data[0];
    return {
      fromChainId: route.fromChainId,
      toChainId: route.toChainId,
      fromToken: { symbol: route.fromToken.tokenSymbol, address: route.fromToken.tokenContractAddress, decimals: Number(route.fromToken.decimal) },
      toToken: { symbol: route.toToken.tokenSymbol, address: route.toToken.tokenContractAddress, decimals: Number(route.toToken.decimal) },
      fromAmount: route.fromTokenAmount,
      toAmount: route.toTokenAmount,
      bridgeName: route.bridgeName ?? "okx",
      estimatedGas: route.estimatedGas ?? "0",
      tx: { to: route.tx.to, data: route.tx.data, value: route.tx.value ?? "0", gasPrice: route.tx.gasPrice },
      needApproval: route.needApprove === "true" || route.needApprove === true,
      approveTo: route.approveTo,
    };
  }

  async getApproveData(params: {
    chainId: string;
    tokenAddress: string;
    amount: string;
    approveAddress: string;
  }): Promise<{ to: string; data: string }> {
    const data = await this.request<any[]>("GET", "/api/v5/dex/cross-chain/approve-transaction", {
      chainId: params.chainId,
      tokenContractAddress: params.tokenAddress,
      approveAmount: params.amount,
    });
    return { to: data[0].to, data: data[0].data };
  }

  async getStatus(txHash: string): Promise<OkxBridgeStatus> {
    const data = await this.request<any[]>("GET", "/api/v5/dex/cross-chain/status", {
      hash: txHash,
    });
    const result = data[0];
    return {
      status: result.status,
      fromChainId: result.fromChainId,
      toChainId: result.toChainId,
      txHash,
      bridgeName: result.bridgeName ?? "okx",
      sourceChainGasfee: result.sourceChainGasfee,
      destinationChainGasfee: result.destinationChainGasfee,
      crossChainFee: result.crossChainFee,
    };
  }

  async getSupportedChains(): Promise<Array<{ chainId: string; chainName: string }>> {
    const data = await this.request<any[]>("GET", "/api/v5/dex/cross-chain/supported/chains", {});
    return data.map((c: any) => ({ chainId: c.chainId, chainName: c.chainName }));
  }

  async getSupportedTokens(chainId?: string): Promise<Array<{ symbol: string; address: string; decimals: number; chainId: string }>> {
    const params: Record<string, string> = {};
    if (chainId) params.chainId = chainId;
    const data = await this.request<any[]>("GET", "/api/v5/dex/cross-chain/supported/tokens", params);
    return data.map((t: any) => ({
      symbol: t.tokenSymbol,
      address: t.tokenContractAddress,
      decimals: Number(t.decimal),
      chainId: t.chainId,
    }));
  }
}
```

- [ ] **Step 4: Run tests**

Run: `bun test tests/protocols/okx-bridge/client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/protocols/okx-bridge/client.ts tests/protocols/okx-bridge/client.test.ts
git commit -m "feat(okx-bridge): add OKX cross-chain client with HMAC signing"
```

---

### Task 8: OKX Bridge operations (WriteOperation)

**Files:**
- Create: `src/protocols/okx-bridge/operations.ts`
- Test: `tests/protocols/okx-bridge/operations.test.ts`

- [ ] **Step 1: Write failing operation test**

```typescript
// tests/protocols/okx-bridge/operations.test.ts
import { describe, expect, test, mock } from "bun:test";

mock.module("../../../src/protocols/okx-bridge/client", () => ({
  OkxBridgeClient: class {
    async getQuote() {
      return {
        fromChainId: "1", toChainId: "42161",
        fromToken: { symbol: "USDC", address: "0xA0b8", decimals: 6 },
        toToken: { symbol: "USDC", address: "0xaf88", decimals: 6 },
        fromAmount: "100000000", toAmount: "99800000",
        bridgeName: "across", estimatedGas: "200000",
        tx: { to: "0x1234", data: "0x5678", value: "0" },
        needApproval: false,
      };
    }
    async getApproveData() { return { to: "0x1234", data: "0x5678" }; }
  },
}));

mock.module("../../../src/core/context", () => ({
  getActiveWalletPort: mock(async () => ({ signAndSendTransaction: mock() })),
  getActiveWallet: mock(async () => ({ address: "0xuser" })),
}));

import { createOkxBridgeOperation } from "../../../src/protocols/okx-bridge/operations";

describe("createOkxBridgeOperation", () => {
  const op = createOkxBridgeOperation({
    fromChain: "ethereum",
    toChain: "arbitrum",
    fromToken: "USDC",
    toToken: "USDC",
    amount: 100,
  });

  test("protocol is okx", () => {
    expect(op.protocol).toBe("okx");
  });

  test("prepare returns quote", async () => {
    const prepared = await op.prepare();
    expect(prepared.quote).toBeDefined();
    expect(prepared.quote.bridgeName).toBe("across");
  });

  test("createPlan has bridge group and destination in metadata", async () => {
    const prepared = await op.prepare();
    const plan = op.createPlan(prepared);
    expect(plan.operation.group).toBe("bridge");
    expect(plan.operation.protocol).toBe("okx");
    expect(plan.chain).toBe("ethereum");
    expect(plan.metadata?.destinationChain).toBe("arbitrum");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/protocols/okx-bridge/operations.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement operations**

```typescript
// src/protocols/okx-bridge/operations.ts
import { getActiveWallet, getActiveWalletPort } from "../../core/context";
import { resolveChainId } from "../../core/chain-ids";
import {
  createApprovalStep,
  createExecutionPlan,
  createTransactionStep,
  type ExecutionPlanStep,
} from "../../core/execution-plan";
import type { WalletPort } from "../../core/signers";
import type { WriteOperation } from "../../core/write-operation";
import { OkxBridgeClient } from "./client";
import type { OkxBridgeQuote, OkxBridgeResult } from "./types";

export interface OkxBridgeParams {
  fromChain: string;
  toChain: string;
  fromToken: string;
  toToken: string;
  amount: number;
}

export interface PreparedOkxBridge extends OkxBridgeParams {
  quote: OkxBridgeQuote;
  fromAddress: string;
  fromChainId: string; // CAIP-2
  approveData?: { to: string; data: string };
}

/** Extract numeric chain ID string for OKX API from chain name */
export function getOkxChainId(chainName: string): string {
  const caip2 = resolveChainId(chainName);
  return caip2.split(":")[1];
}

export function createOkxBridgeOperation(
  params: OkxBridgeParams,
): WriteOperation<PreparedOkxBridge, WalletPort, OkxBridgeResult> {
  return {
    protocol: "okx",
    prepare: async () => {
      const wallet = await getActiveWallet("evm");
      const client = new OkxBridgeClient();
      const fromChainOkxId = getOkxChainId(params.fromChain);
      const toChainOkxId = getOkxChainId(params.toChain);
      const fromChainId = resolveChainId(params.fromChain);

      const quote = await client.getQuote({
        fromChainId: fromChainOkxId,
        toChainId: toChainOkxId,
        fromTokenAddress: params.fromToken,
        toTokenAddress: params.toToken,
        amount: String(params.amount),
        userWalletAddress: wallet.address,
      });

      let approveData: { to: string; data: string } | undefined;
      if (quote.needApproval && quote.approveTo) {
        approveData = await client.getApproveData({
          chainId: fromChainOkxId,
          tokenAddress: quote.fromToken.address,
          amount: quote.fromAmount,
          approveAddress: quote.approveTo,
        });
      }

      return { ...params, quote, fromAddress: wallet.address, fromChainId, approveData };
    },
    createPreview: (prepared) => ({
      action: `Bridge ${prepared.amount} ${prepared.fromToken} from ${prepared.fromChain} to ${prepared.toChain} via OKX (${prepared.quote.bridgeName})`,
      details: {
        from: `${prepared.quote.fromToken.symbol} on ${prepared.fromChain}`,
        to: `${prepared.quote.toToken.symbol} on ${prepared.toChain}`,
        estimatedOutput: prepared.quote.toAmount,
        estimatedGas: prepared.quote.estimatedGas,
        bridge: prepared.quote.bridgeName,
      },
    }),
    createPlan: (prepared) => {
      const steps: ExecutionPlanStep[] = [];

      if (prepared.approveData) {
        steps.push(
          createApprovalStep("Approve bridge contract", {
            token: prepared.quote.fromToken.symbol,
            amount: prepared.amount,
            spender: prepared.quote.approveTo ?? "OKX Bridge",
          }),
        );
      }

      steps.push(
        createTransactionStep("Submit bridge transaction", {
          from: `${prepared.quote.fromToken.symbol} on ${prepared.fromChain}`,
          to: `${prepared.quote.toToken.symbol} on ${prepared.toChain}`,
          bridge: prepared.quote.bridgeName,
          estimatedOutput: prepared.quote.toAmount,
        }),
      );

      return createExecutionPlan({
        summary: `Bridge ${prepared.amount} ${prepared.fromToken} from ${prepared.fromChain} to ${prepared.toChain} via OKX`,
        group: "bridge",
        protocol: "okx",
        command: "bridge",
        chain: prepared.fromChain,
        accountType: "evm",
        steps,
        metadata: {
          destinationChain: prepared.toChain,
          bridgeName: prepared.quote.bridgeName,
        },
      });
    },
    resolveAuth: async () => await getActiveWalletPort("evm"),
    execute: async (prepared, signer) => {
      const txHash = await signer.signAndSendTransaction(
        prepared.fromChainId,
        {
          format: "evm-transaction",
          to: prepared.quote.tx.to as `0x${string}`,
          data: prepared.quote.tx.data as `0x${string}`,
          value: prepared.quote.tx.value
            ? BigInt(prepared.quote.tx.value)
            : undefined,
        },
      );
      return {
        txHash: String(txHash),
        fromChainId: prepared.quote.fromChainId,
        toChainId: prepared.quote.toChainId,
        fromToken: prepared.quote.fromToken.symbol,
        toToken: prepared.quote.toToken.symbol,
        fromAmount: String(prepared.amount),
        estimatedToAmount: prepared.quote.toAmount,
      };
    },
  };
}
```

- [ ] **Step 4: Run tests**

Run: `bun test tests/protocols/okx-bridge/operations.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/protocols/okx-bridge/operations.ts tests/protocols/okx-bridge/operations.test.ts
git commit -m "feat(okx-bridge): add bridge WriteOperation"
```

---

### Task 9: OKX Bridge commands + registry

**Files:**
- Create: `src/protocols/okx-bridge/commands.ts`
- Modify: `src/protocols/registry.ts`
- Modify: `tests/protocols/registry.test.ts`

- [ ] **Step 1: Update registry test to expect okx in bridge group**

In `tests/protocols/registry.test.ts`, update:
```typescript
// Change:
// expect(groups.bridge.map((p) => p.name)).toEqual(["lifi"]);
// To:
expect(groups.bridge.map((p) => p.name)).toEqual(["lifi", "okx"]);
```

Update the `listProtocols` name array to include `"okx"` at the end (this is the second "okx" — the first is the CEX).

Also add this test to lock in the `getProtocol` behavior:
```typescript
// Note: "okx" appears twice — once for CEX (type: "cex"), once for bridge (type: "bridge").
// getProtocol("okx") returns the first match (CEX). This is expected and documented in the spec.
expect(getProtocol("okx")?.type).toBe("cex");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/protocols/registry.test.ts`
Expected: FAIL

- [ ] **Step 3: Create commands.ts**

```typescript
// src/protocols/okx-bridge/commands.ts
import { defineCommand } from "citty";
import { evmChainArg, isEvmChain, normalizeChainName } from "../../core/chain-ids";
import { getActiveWallet } from "../../core/context";
import { createOutput, resolveOutputOptions } from "../../core/output";
import { validateAmount, validateTokenSymbol } from "../../core/validation";
import { runWriteOperation } from "../../core/write-operation";
import type { ProtocolDefinition } from "../types";
import { OkxBridgeClient } from "./client";
import { createOkxBridgeOperation, getOkxChainId } from "./operations";

function validateEvmBridgeChain(value: string): string {
  const chain = normalizeChainName(value);
  if (!isEvmChain(chain)) {
    console.error(`Error: Only EVM chains are supported for bridging in this version. Got: ${value}`);
    process.exit(1);
  }
  return chain;
}

const bridge = defineCommand({
  meta: { name: "bridge", description: "Bridge tokens cross-chain via OKX" },
  args: {
    token: { type: "positional", description: "Token to bridge (e.g. USDC, ETH)", required: true },
    to: { type: "string", description: "Destination token (defaults to same as source)", required: false },
    amount: { type: "positional", description: "Amount to bridge", required: true },
    "from-chain": evmChainArg("ethereum"),
    "to-chain": { type: "string", description: "Destination chain", required: true },
    yes: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const fromToken = validateTokenSymbol(args.token);
    const toToken = args.to ? validateTokenSymbol(args.to) : fromToken;
    const amount = validateAmount(args.amount, "Bridge amount");
    const fromChain = validateEvmBridgeChain(args["from-chain"]);
    const toChain = validateEvmBridgeChain(args["to-chain"]);

    await runWriteOperation(
      args,
      createOkxBridgeOperation({ fromChain, toChain, fromToken, toToken, amount }),
      {
        formatResult: (result) => ({
          ...result,
          message: `Bridge submitted. Track status: wooo bridge okx status ${result.txHash}`,
        }),
      },
    );
  },
});

const quote = defineCommand({
  meta: { name: "quote", description: "Get a bridge quote without executing" },
  args: {
    token: { type: "positional", description: "Token to bridge", required: true },
    to: { type: "string", description: "Destination token", required: false },
    amount: { type: "positional", description: "Amount to bridge", required: true },
    "from-chain": evmChainArg("ethereum"),
    "to-chain": { type: "string", description: "Destination chain", required: true },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));
    const fromToken = validateTokenSymbol(args.token);
    const toToken = args.to ? validateTokenSymbol(args.to) : fromToken;
    const amount = validateAmount(args.amount, "Quote amount");
    const fromChain = validateEvmBridgeChain(args["from-chain"]);
    const toChain = validateEvmBridgeChain(args["to-chain"]);

    const wallet = await getActiveWallet("evm");

    const client = new OkxBridgeClient();
    const result = await client.getQuote({
      fromChainId: getOkxChainId(fromChain),
      toChainId: getOkxChainId(toChain),
      fromTokenAddress: fromToken,
      toTokenAddress: toToken,
      amount: String(amount),
      userWalletAddress: wallet.address,
    });
    out.data(result);
  },
});

const status = defineCommand({
  meta: { name: "status", description: "Check bridge transaction status" },
  args: {
    txHash: { type: "positional", description: "Transaction hash", required: true },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));
    const client = new OkxBridgeClient();
    const result = await client.getStatus(args.txHash);
    out.data(result);
  },
});

const chains = defineCommand({
  meta: { name: "chains", description: "List supported chains and tokens" },
  args: {
    tokens: { type: "boolean", description: "Include supported tokens", default: false },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));
    const client = new OkxBridgeClient();
    const chainList = await client.getSupportedChains();

    if (args.tokens) {
      const tokenList = await client.getSupportedTokens();
      out.data({ chains: chainList, tokens: tokenList });
    } else {
      out.data({ chains: chainList });
    }
  },
});

export const okxBridgeProtocol: ProtocolDefinition = {
  name: "okx",
  displayName: "OKX Cross-Chain Bridge",
  type: "bridge",
  writeAccountType: "evm",
  setup: () =>
    defineCommand({
      meta: { name: "okx", description: "OKX Cross-Chain Bridge" },
      subCommands: {
        bridge: () => Promise.resolve(bridge),
        quote: () => Promise.resolve(quote),
        status: () => Promise.resolve(status),
        chains: () => Promise.resolve(chains),
      },
    }),
};
```

- [ ] **Step 4: Register in registry.ts**

Add to `src/protocols/registry.ts`:
- Import: `import { okxBridgeProtocol } from "./okx-bridge/commands";`
- Add `okxBridgeProtocol` to the `protocols` array after `lifiProtocol`

- [ ] **Step 5: Run registry tests**

Run: `bun test tests/protocols/registry.test.ts`
Expected: PASS

- [ ] **Step 6: Run all tests**

Run: `bun test`
Expected: All PASS

- [ ] **Step 7: Run type-check and lint**

Run: `bun run type-check && bun run lint`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/protocols/okx-bridge/commands.ts src/protocols/registry.ts tests/protocols/registry.test.ts
git commit -m "feat(okx-bridge): add OKX bridge commands and register protocol"
```

---

### Task 10: Final verification

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `bun test`
Expected: All PASS

- [ ] **Step 2: Run CI checks**

Run: `bun run type-check && bun run lint`
Expected: PASS

- [ ] **Step 3: Verify CLI help output**

Run: `bun run dev -- bridge --help`
Expected: Shows `lifi` and `okx` as available subcommands

Run: `bun run dev -- bridge lifi --help`
Expected: Shows `bridge`, `quote`, `status`, `chains` subcommands

Run: `bun run dev -- bridge okx --help`
Expected: Shows `bridge`, `quote`, `status`, `chains` subcommands

- [ ] **Step 4: Commit all remaining changes (if any)**

```bash
git status
# If clean, no commit needed
```
