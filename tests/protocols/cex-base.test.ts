import { describe, expect, test } from "bun:test";
import { CexClient } from "../../src/protocols/cex-base/client";

describe("CexClient", () => {
  test("creates binance client without auth", () => {
    const client = new CexClient("binance");
    expect(client).toBeDefined();
  });

  test("creates okx client without auth", () => {
    const client = new CexClient("okx");
    expect(client).toBeDefined();
  });

  test("creates bybit client without auth", () => {
    const client = new CexClient("bybit");
    expect(client).toBeDefined();
  });

  test("throws for unsupported exchange", () => {
    expect(() => new CexClient("nonexistent")).toThrow();
  });
});
