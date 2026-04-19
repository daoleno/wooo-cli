import { describe, expect, mock, test } from "bun:test";

const fetchAaveMarkets = mock(async () => [
  {
    name: "AaveV3Ethereum",
    address: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
    reserves: [
      {
        underlyingToken: {
          symbol: "WETH",
          address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
          decimals: 18,
        },
        supplyInfo: {
          apy: { formatted: "0" },
          maxLTV: { formatted: "0" },
          canBeCollateral: false,
        },
        borrowInfo: {
          apy: { formatted: "0" },
          borrowingState: "ENABLED" as const,
        },
        isFrozen: true,
        isPaused: false,
      },
    ],
  },
]);

mock.module("../../../src/protocols/aave/api", () => ({
  fetchAaveMarkets,
}));

import { AaveClient } from "../../../src/protocols/aave/client";

describe("AaveClient borrow guardrails", () => {
  test("borrow rejects frozen reserves before sending a transaction", async () => {
    const signAndSendTransaction = mock(async () => "0xdeadbeef");
    const client = new AaveClient("ethereum", {
      address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      signAndSendTransaction,
    } as never);

    await expect(client.borrow("WETH", 0.01, "AaveV3Ethereum")).rejects.toThrow(
      "Aave reserve WETH in AaveV3Ethereum on ethereum is currently frozen and cannot be borrowed",
    );
    expect(fetchAaveMarkets).toHaveBeenCalledTimes(1);
    expect(signAndSendTransaction).not.toHaveBeenCalled();
  });
});
