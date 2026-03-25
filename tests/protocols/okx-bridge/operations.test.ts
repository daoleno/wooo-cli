import { describe, expect, mock, test } from "bun:test";

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
    return map[name] ?? "eip155:1";
  }),
}));

// Set env vars for OKX auth
process.env.WOOO_OKX_API_KEY = "test-key";
process.env.WOOO_OKX_API_SECRET = "test-secret";
process.env.WOOO_OKX_PASSPHRASE = "test-pass";
process.env.WOOO_OKX_PROJECT_ID = "test-project";

// Mock fetch for OKX API
globalThis.fetch = mock(
  async () =>
    new Response(
      JSON.stringify({
        code: "0",
        msg: "",
        data: [
          {
            fromChainId: "1",
            toChainId: "42161",
            fromToken: {
              tokenSymbol: "USDC",
              tokenContractAddress: "0xA0b8",
              decimal: "6",
            },
            toToken: {
              tokenSymbol: "USDC",
              tokenContractAddress: "0xaf88",
              decimal: "6",
            },
            fromTokenAmount: "100000000",
            toTokenAmount: "99800000",
            bridgeName: "across",
            estimatedGas: "200000",
            tx: { to: "0x1234", data: "0x5678", value: "0" },
            needApprove: "false",
          },
        ],
      }),
      { status: 200 },
    ),
) as any;

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
