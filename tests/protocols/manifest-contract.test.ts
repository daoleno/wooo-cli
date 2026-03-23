import { describe, expect, test } from "bun:test";
import { listProtocols } from "../../src/protocols/registry";

describe("protocol manifest contract", () => {
  test("write protocols declare their execution account type", () => {
    const manifest = Object.fromEntries(
      listProtocols().map((protocol) => [
        protocol.name,
        protocol.writeAccountType,
      ]),
    );

    expect(manifest).toEqual({
      okx: "exchange-api",
      binance: "exchange-api",
      bybit: "exchange-api",
      hyperliquid: "evm",
      polymarket: "evm",
      uniswap: "evm",
      curve: "evm",
      jupiter: "solana",
      aave: "evm",
      morpho: "evm",
      lido: "evm",
      mpp: "evm",
      x402: "evm",
    });
  });

  test("manifest setup returns a command whose name matches the protocol", () => {
    for (const protocol of listProtocols()) {
      const command = protocol.setup();
      expect(command.meta?.name).toBe(protocol.name);
    }
  });
});
