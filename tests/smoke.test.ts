import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { $ } from "bun";

describe("wooo-cli smoke tests", () => {
  test("shows help with grouped command structure", async () => {
    const result = await $`bun run src/index.ts --help`.text();
    expect(result).toContain("wooo-cli");
    expect(result).toContain("config");
    expect(result).toContain("wallet");
    expect(result).toContain("market");
    expect(result).toContain("portfolio");
    // Protocol groups instead of individual protocols
    expect(result).toContain("cex");
    expect(result).toContain("perps");
    expect(result).toContain("dex");
    expect(result).toContain("lend");
    expect(result).toContain("stake");
    expect(result).toContain("chain");
    expect(result).toContain("swap");
    expect(result).not.toContain("bridge");
    expect(result).not.toContain("defi");
    expect(result).not.toContain("capabilities");
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
    expect(result).toContain("curve");
    expect(result).toContain("jupiter");
  });

  test("lend group shows protocols", async () => {
    const result = await $`bun run src/index.ts lend --help`.text();
    expect(result).toContain("aave");
    expect(result).toContain("morpho");
  });

  test("stake group shows protocols", async () => {
    const result = await $`bun run src/index.ts stake --help`.text();
    expect(result).toContain("lido");
  });

  test("dex uniswap shows subcommands", async () => {
    const result = await $`bun run src/index.ts dex uniswap --help`.text();
    expect(result).toContain("swap");
    expect(result).toContain("quote");
    expect(result).toContain("tokens");
  });

  test("lend aave shows subcommands", async () => {
    const result = await $`bun run src/index.ts lend aave --help`.text();
    expect(result).toContain("supply");
    expect(result).toContain("withdraw");
    expect(result).toContain("borrow");
    expect(result).toContain("repay");
    expect(result).toContain("positions");
    expect(result).toContain("markets");
    expect(result).toContain("rates");
  });

  test("lend morpho shows subcommands", async () => {
    const result = await $`bun run src/index.ts lend morpho --help`.text();
    expect(result).toContain("markets");
    expect(result).toContain("market");
    expect(result).toContain("positions");
    expect(result).toContain("supply");
    expect(result).toContain("withdraw");
    expect(result).toContain("supply-collateral");
    expect(result).toContain("withdraw-collateral");
    expect(result).toContain("borrow");
    expect(result).toContain("repay");
  });

  test("stake lido shows subcommands", async () => {
    const result = await $`bun run src/index.ts stake lido --help`.text();
    expect(result).toContain("stake");
    expect(result).toContain("rewards");
    expect(result).toContain("balance");
  });

  test("dex curve shows subcommands", async () => {
    const result = await $`bun run src/index.ts dex curve --help`.text();
    expect(result).toContain("swap");
    expect(result).toContain("quote");
    expect(result).toContain("pools");
  });

  test("chain help shows subcommands", async () => {
    const result = await $`bun run src/index.ts chain --help`.text();
    expect(result).toContain("tx");
    expect(result).toContain("balance");
    expect(result).toContain("ens");
    expect(result).toContain("call");
    expect(result).toContain("okx");
  });

  test("dex jupiter shows subcommands", async () => {
    const result = await $`bun run src/index.ts dex jupiter --help`.text();
    expect(result).toContain("swap");
    expect(result).toContain("quote");
    expect(result).toContain("tokens");
  });

  test("swap aggregator shows help", async () => {
    const result = await $`bun run src/index.ts swap --help`.text();
    expect(result).toContain("TOKENIN");
    expect(result).toContain("TOKENOUT");
    expect(result).toContain("AMOUNT");
    expect(result).toContain("chain");
  });

  test("help shows common chain aliases", async () => {
    const result = await $`bun run src/index.ts swap --help`.text();
    expect(result).toContain("ethereum|eth");
    expect(result).toContain("arbitrum|arb");
    expect(result).toContain("solana|sol");
  });

  test("config list returns defaults", async () => {
    const result = await $`bun run src/index.ts config list`.text();
    expect(result).toContain("ethereum");
  });

  test("wallet help shows subcommands", async () => {
    const result = await $`bun run src/index.ts wallet --help`.text();
    expect(result).toContain("connect");
    expect(result).toContain("discover");
    expect(result).toContain("generate");
    expect(result).toContain("import");
    expect(result).toContain("list");
    expect(result).toContain("balance");
    expect(result).toContain("switch");
  });

  test("wallet connect help shows external wallet transport options", async () => {
    const result = await $`bun run src/index.ts wallet connect --help`.text();
    expect(result).toContain("command");
    expect(result).toContain("broker-url");
    expect(result).toContain("auth-env");
    expect(result).toContain("local signer service");
  });

  test("wallet discover help shows service and broker options", async () => {
    const result = await $`bun run src/index.ts wallet discover --help`.text();
    expect(result).toContain("broker-url");
    expect(result).toContain("auth-env");
    expect(result).toContain("signer service");
    expect(result).toContain("wallet broker");
  });

  test("market help shows subcommands", async () => {
    const result = await $`bun run src/index.ts market --help`.text();
    expect(result).toContain("price");
    expect(result).toContain("search");
    expect(result).toContain("okx");
  });

  test("portfolio help shows subcommands", async () => {
    const result = await $`bun run src/index.ts portfolio --help`.text();
    expect(result).toContain("overview");
    expect(result).toContain("okx");
  });

  test("market okx help shows subcommands", async () => {
    const result = await $`bun run src/index.ts market okx --help`.text();
    expect(result).toContain("chains");
    expect(result).toContain("search");
    expect(result).toContain("token");
    expect(result).toContain("metrics");
    expect(result).toContain("price");
    expect(result).toContain("trades");
    expect(result).toContain("candles");
    expect(result).toContain("holders");
    expect(result).toContain("ranking");
  });

  test("portfolio okx help shows subcommands", async () => {
    const result = await $`bun run src/index.ts portfolio okx --help`.text();
    expect(result).toContain("chains");
    expect(result).toContain("overview");
    expect(result).toContain("recent-pnl");
    expect(result).toContain("latest-pnl");
    expect(result).toContain("dex-history");
    expect(result).toContain("value");
    expect(result).toContain("balances");
    expect(result).toContain("balance");
  });

  test("chain okx help shows subcommands", async () => {
    const result = await $`bun run src/index.ts chain okx --help`.text();
    expect(result).toContain("chains");
    expect(result).toContain("history");
    expect(result).toContain("tx");
  });

  test("json subcommand output is not polluted by the root banner", async () => {
    const result =
      await $`bun run src/index.ts dex jupiter tokens --json`.text();
    const parsed = JSON.parse(result) as { chain: string; tokens: string[] };
    expect(parsed.chain).toBe("solana");
    expect(parsed.tokens).toContain("SOL");
  });

  test("evm chain aliases are normalized in command output", async () => {
    const result =
      await $`bun run src/index.ts dex uniswap tokens --chain eth --json`.text();
    const parsed = JSON.parse(result) as { chain: string; tokens: string[] };
    expect(parsed.chain).toBe("ethereum");
    expect(parsed.tokens).toContain("USDC");
  });

  test("package manifest exposes a node-executable wooo-cli bin", () => {
    const manifest = JSON.parse(readFileSync("package.json", "utf8")) as {
      bin?: Record<string, string>;
    };
    const wrapper = readFileSync("bin/wooo-cli.mjs", "utf8");

    expect(manifest.bin?.["wooo-cli"]).toBe("./bin/wooo-cli.mjs");
    expect(wrapper.startsWith("#!/usr/bin/env node")).toBe(true);
    expect(wrapper).toContain("../dist/index.mjs");
  });
});
