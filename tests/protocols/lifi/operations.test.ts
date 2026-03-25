import { beforeEach, describe, expect, mock, test } from "bun:test";

// Mock @lifi/sdk (what the client calls internally) — include all functions
// to avoid breaking other tests that import from the same module
mock.module("@lifi/sdk", () => ({
  createConfig: mock(() => {}),
  getQuote: mock(async () => ({
    action: {
      fromChainId: 1,
      toChainId: 42161,
      fromToken: {
        symbol: "USDC",
        address: "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        decimals: 6,
      },
      toToken: {
        symbol: "USDC",
        address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
        decimals: 6,
      },
      fromAmount: "100000000",
    },
    estimate: {
      toAmount: "99800000",
      executionDuration: 120,
      gasCosts: [{ amountUSD: "0.15" }],
      feeCosts: [{ amountUSD: "0.05" }],
      approvalAddress: "0x1111111111111111111111111111111111111111",
    },
    tool: "stargate",
    transactionRequest: {
      to: "0x1234",
      data: "0x5678",
      value: "0",
      gasLimit: "200000",
    },
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
      42161: [
        {
          symbol: "USDC",
          address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
          decimals: 6,
        },
      ],
    },
  })),
  ChainId: { ETH: 1, ARB: 42161 },
}));

// Mock context
const signAndSendTransaction = mock(async () => "0xtx");

mock.module("../../../src/core/context", () => ({
  getActiveWalletPort: mock(async () => ({
    signAndSendTransaction,
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

import { createLifiBridgeOperation } from "../../../src/protocols/lifi/operations";

describe("createLifiBridgeOperation", () => {
  beforeEach(() => {
    signAndSendTransaction.mockClear();
  });

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

  test("execute sends approval before bridge tx when approval is required", async () => {
    const prepared = await op.prepare();
    const signer = { signAndSendTransaction } as any;
    const result = await op.execute(prepared, signer);

    expect(signAndSendTransaction).toHaveBeenCalledTimes(2);
    expect(signAndSendTransaction.mock.calls[0][1].to).toBe(
      "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    );
    expect(signAndSendTransaction.mock.calls[1][1].to).toBe("0x1234");
    expect(result.approvalTxHash).toBe("0xtx");
  });
});
