import { describe, expect, test } from "bun:test";
import { listProtocols } from "../../src/protocols/registry";

describe("protocol manifest contract", () => {
  test("write protocols declare their execution account type", () => {
    // Use array of tuples instead of map to handle duplicate "okx" name
    // (CEX okx = exchange-api, bridge okx = evm)
    const manifest = listProtocols().map((protocol) => [
      protocol.name,
      protocol.type,
      protocol.writeAccountType,
    ]);

    expect(manifest).toEqual([
      ["okx", "cex", "exchange-api"],
      ["binance", "cex", "exchange-api"],
      ["bybit", "cex", "exchange-api"],
      ["hyperliquid", "perps", "evm"],
      ["polymarket", "prediction", "evm"],
      ["uniswap", "dex", "evm"],
      ["curve", "dex", "evm"],
      ["jupiter", "dex", "solana"],
      ["aave", "lending", "evm"],
      ["morpho", "lending", "evm"],
      ["lido", "staking", "evm"],
      ["mpp", "payments", "evm"],
      ["x402", "payments", "evm"],
      ["lifi", "bridge", "evm"],
      ["okx", "bridge", "evm"],
    ]);
  });

  test("manifest setup returns a command whose name matches the protocol", () => {
    for (const protocol of listProtocols()) {
      const command = protocol.setup();
      expect(command.meta?.name).toBe(protocol.name);
    }
  });
});
