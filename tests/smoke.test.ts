import { describe, expect, test } from "bun:test";
import { $ } from "bun";

describe("wooo-cli smoke tests", () => {
  test("shows help with grouped command structure", async () => {
    const result = await $`bun run src/index.ts --help`.text();
    expect(result).toContain("wooo");
    expect(result).toContain("config");
    expect(result).toContain("wallet");
    expect(result).toContain("market");
    expect(result).toContain("portfolio");
    // Protocol groups instead of individual protocols
    expect(result).toContain("cex");
    expect(result).toContain("perps");
    expect(result).toContain("dex");
    expect(result).toContain("defi");
  });

  test("cex group shows exchanges", async () => {
    const result = await $`bun run src/index.ts cex --help`.text();
    expect(result).toContain("okx");
    expect(result).toContain("binance");
    expect(result).toContain("bybit");
  });

  test("perps group shows protocols", async () => {
    const result = await $`bun run src/index.ts perps --help`.text();
    expect(result).toContain("hyperliquid");
  });

  test("cex okx shows subcommands", async () => {
    const result = await $`bun run src/index.ts cex okx --help`.text();
    expect(result).toContain("buy");
    expect(result).toContain("sell");
    expect(result).toContain("long");
    expect(result).toContain("short");
    expect(result).toContain("balance");
    expect(result).toContain("positions");
  });

  test("cex binance shows subcommands", async () => {
    const result = await $`bun run src/index.ts cex binance --help`.text();
    expect(result).toContain("buy");
    expect(result).toContain("sell");
  });

  test("perps hyperliquid shows subcommands", async () => {
    const result =
      await $`bun run src/index.ts perps hyperliquid --help`.text();
    expect(result).toContain("long");
    expect(result).toContain("short");
    expect(result).toContain("positions");
    expect(result).toContain("funding");
  });

  test("dex group shows protocols", async () => {
    const result = await $`bun run src/index.ts dex --help`.text();
    expect(result).toContain("uniswap");
  });

  test("defi group shows protocols", async () => {
    const result = await $`bun run src/index.ts defi --help`.text();
    expect(result).toContain("aave");
    expect(result).toContain("lido");
  });

  test("dex uniswap shows subcommands", async () => {
    const result = await $`bun run src/index.ts dex uniswap --help`.text();
    expect(result).toContain("swap");
    expect(result).toContain("quote");
    expect(result).toContain("tokens");
  });

  test("defi aave shows subcommands", async () => {
    const result = await $`bun run src/index.ts defi aave --help`.text();
    expect(result).toContain("supply");
    expect(result).toContain("borrow");
    expect(result).toContain("positions");
    expect(result).toContain("rates");
  });

  test("defi lido shows subcommands", async () => {
    const result = await $`bun run src/index.ts defi lido --help`.text();
    expect(result).toContain("stake");
    expect(result).toContain("rewards");
    expect(result).toContain("balance");
  });

  test("config list returns defaults", async () => {
    const result = await $`bun run src/index.ts config list`.text();
    expect(result).toContain("ethereum");
  });

  test("wallet help shows subcommands", async () => {
    const result = await $`bun run src/index.ts wallet --help`.text();
    expect(result).toContain("generate");
    expect(result).toContain("import");
    expect(result).toContain("list");
    expect(result).toContain("balance");
    expect(result).toContain("export");
    expect(result).toContain("switch");
  });

  test("market help shows subcommands", async () => {
    const result = await $`bun run src/index.ts market --help`.text();
    expect(result).toContain("price");
    expect(result).toContain("search");
  });

  test("portfolio help shows subcommands", async () => {
    const result = await $`bun run src/index.ts portfolio --help`.text();
    expect(result).toContain("overview");
  });
});
