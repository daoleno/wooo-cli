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
