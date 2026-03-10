import { describe, expect, test } from "bun:test";
import { $ } from "bun";

describe("wooo-cli smoke tests", () => {
  test("shows help", async () => {
    const result = await $`bun run src/index.ts --help`.text();
    expect(result).toContain("wooo");
    expect(result).toContain("config");
    expect(result).toContain("wallet");
    expect(result).toContain("hyperliquid");
  });

  test("config list returns defaults", async () => {
    const result = await $`bun run src/index.ts config list`.text();
    expect(result).toContain("ethereum");
  });

  test("hyperliquid help shows subcommands", async () => {
    const result = await $`bun run src/index.ts hyperliquid --help`.text();
    expect(result).toContain("long");
    expect(result).toContain("short");
    expect(result).toContain("positions");
    expect(result).toContain("funding");
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
});
