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
