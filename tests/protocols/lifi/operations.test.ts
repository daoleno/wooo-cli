import { describe, expect, test, mock } from "bun:test";

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
        transactionRequest: {
          to: "0x1234",
          data: "0x5678",
          value: "0",
          gasLimit: "200000",
        },
      };
    }
  },
}));

// Mock context
mock.module("../../../src/core/context", () => ({
  getActiveWalletPort: mock(async () => ({
    signAndSendTransaction: mock(),
  })),
  getActiveWallet: mock(async () => ({ address: "0xuser" })),
}));

// Mock chain-ids
mock.module("../../../src/core/chain-ids", () => ({
  resolveChainId: mock((name: string) => {
    const map: Record<string, string> = {
      ethereum: "eip155:1",
      arbitrum: "eip155:42161",
    };
    return map[name] ?? `eip155:1`;
  }),
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
    expect(preview.action).toContain("Bridge");
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
