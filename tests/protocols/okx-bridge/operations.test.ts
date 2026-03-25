import { describe, expect, test, mock } from "bun:test";

mock.module("../../../src/protocols/okx-bridge/client", () => ({
  OkxBridgeClient: class {
    async getQuote() {
      return {
        fromChainId: "1",
        toChainId: "42161",
        fromToken: { symbol: "USDC", address: "0xA0b8", decimals: 6 },
        toToken: { symbol: "USDC", address: "0xaf88", decimals: 6 },
        fromAmount: "100000000",
        toAmount: "99800000",
        bridgeName: "across",
        estimatedGas: "200000",
        tx: { to: "0x1234", data: "0x5678", value: "0" },
        needApproval: false,
      };
    }
    async getApproveData() {
      return { to: "0x1234", data: "0x5678" };
    }
  },
}));

mock.module("../../../src/core/context", () => ({
  getActiveWalletPort: mock(async () => ({
    signAndSendTransaction: mock(),
  })),
  getActiveWallet: mock(async () => ({ address: "0xuser" })),
}));

mock.module("../../../src/core/chain-ids", () => ({
  resolveChainId: mock((name: string) => {
    const map: Record<string, string> = {
      ethereum: "eip155:1",
      arbitrum: "eip155:42161",
    };
    return map[name] ?? `eip155:1`;
  }),
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

  test("createPreview contains bridge info", async () => {
    const prepared = await op.prepare();
    const preview = op.createPreview(prepared);
    expect(preview.action).toContain("Bridge");
    expect(preview.action).toContain("USDC");
    expect(preview.action).toContain("OKX");
  });
});
