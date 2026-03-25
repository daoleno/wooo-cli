import { describe, expect, mock, test } from "bun:test";

// Mock @lifi/sdk before importing client
mock.module("@lifi/sdk", () => ({
  createConfig: mock(() => {}),
  getQuote: mock(async () => ({
    action: {
      fromChainId: 1,
      toChainId: 42161,
      fromToken: { symbol: "USDC", address: "0xA0b8" },
      toToken: { symbol: "USDC", address: "0xaf88" },
      fromAmount: "100000000",
    },
    estimate: {
      toAmount: "99800000",
      executionDuration: 120,
      gasCosts: [{ amountUSD: "0.15" }],
      feeCosts: [{ amountUSD: "0.05" }],
      approvalAddress: "0xapprove",
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
    expect(quote.fromChain).toBe("1");
    expect(quote.toChain).toBe("42161");
    expect(quote.toAmount).toBe("99800000");
    expect(quote.transactionRequest.to).toBe("0x1234");
    expect(quote.bridgeName).toBe("stargate");
    expect(quote.fees.gas).toBe("0.15");
    expect(quote.fees.bridge).toBe("0.05");
  });

  test("getStatus returns mapped LifiStatus", async () => {
    const status = await client.getStatus("0xabc", "stargate", 1, 42161);
    expect(status.status).toBe("DONE");
    expect(status.substatus).toBe("COMPLETED");
    expect(status.bridgeName).toBe("stargate");
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
