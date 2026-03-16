import { describe, expect, test } from "bun:test";
import { $ } from "bun";

describe("execution plan dry-run output", () => {
  test("aave supply returns an execution plan", async () => {
    const result =
      await $`bun run src/index.ts defi aave supply USDC 100 --chain ethereum --dry-run --json`.text();
    const parsed = JSON.parse(result) as {
      kind: string;
      operation: { protocol: string; command: string };
      chain: string;
      steps: Array<{ kind: string }>;
    };

    expect(parsed.kind).toBe("execution-plan");
    expect(parsed.operation.protocol).toBe("aave");
    expect(parsed.operation.command).toBe("supply");
    expect(parsed.chain).toBe("ethereum");
    expect(parsed.steps[0]?.kind).toBe("approval");
    expect(parsed.steps[1]?.kind).toBe("transaction");
  });

  test(
    "curve swap returns an execution plan",
    async () => {
      const result =
        await $`bun run src/index.ts dex curve swap USDC USDT 100 --chain ethereum --dry-run --json`.text();
      const parsed = JSON.parse(result) as {
        kind: string;
        operation: { protocol: string; command: string };
        chain: string;
        steps: Array<{ kind: string }>;
      };

      expect(parsed.kind).toBe("execution-plan");
      expect(parsed.operation.protocol).toBe("curve");
      expect(parsed.operation.command).toBe("swap");
      expect(parsed.chain).toBe("ethereum");
      expect(parsed.steps[0]?.kind).toBe("approval");
      expect(parsed.steps[1]?.kind).toBe("transaction");
    },
    { timeout: 30000 },
  );

  test(
    "jupiter swap returns an execution plan",
    async () => {
      const result =
        await $`bun run src/index.ts dex jupiter swap SOL USDC 0.1 --dry-run --json`.text();
      const parsed = JSON.parse(result) as {
        kind: string;
        operation: { protocol: string; command: string };
        chain: string;
        accountType: string;
        steps: Array<{ kind: string }>;
      };

      expect(parsed.kind).toBe("execution-plan");
      expect(parsed.operation.protocol).toBe("jupiter");
      expect(parsed.operation.command).toBe("swap");
      expect(parsed.chain).toBe("solana");
      expect(parsed.accountType).toBe("solana");
      expect(parsed.steps[0]?.kind).toBe("transaction");
    },
    { timeout: 30000 },
  );

  test(
    "aggregated EVM swap returns the selected route execution plan",
    async () => {
      const result =
        await $`bun run src/index.ts swap USDC USDT 100 --chain ethereum --dry-run --json`.text();
      const parsed = JSON.parse(result) as {
        kind: string;
        operation: { protocol: string; command: string };
        metadata?: { bestRoute?: string; quotes?: Array<{ protocol: string }> };
        warnings: string[];
      };

      expect(parsed.kind).toBe("execution-plan");
      expect(parsed.operation.command).toBe("swap");
      expect(["curve", "uniswap"]).toContain(parsed.operation.protocol);
      expect(parsed.metadata?.bestRoute).toBe(parsed.operation.protocol);
      expect(parsed.metadata?.quotes?.length).toBeGreaterThan(0);
      expect(parsed.warnings).toContain(
        "This plan was selected by the aggregated swap router.",
      );
    },
    { timeout: 30000 },
  );

  test("lido stake returns an execution plan", async () => {
    const result =
      await $`bun run src/index.ts defi lido stake 1 --dry-run --json`.text();
    const parsed = JSON.parse(result) as {
      kind: string;
      operation: { protocol: string; command: string };
      chain: string;
      steps: Array<{ kind: string }>;
    };

    expect(parsed.kind).toBe("execution-plan");
    expect(parsed.operation.protocol).toBe("lido");
    expect(parsed.operation.command).toBe("stake");
    expect(parsed.chain).toBe("ethereum");
    expect(parsed.steps).toHaveLength(1);
    expect(parsed.steps[0]?.kind).toBe("transaction");
  });

  test(
    "curve pools json returns stable machine-readable output",
    async () => {
      const result =
        await $`bun run src/index.ts dex curve pools --chain ethereum --json`.text();
      const parsed = JSON.parse(result) as {
        chain: string;
        pools: Array<{ address: string; name: string; tokens: string[] }>;
      };

      expect(parsed.chain).toBe("ethereum");
      expect(parsed.pools.length).toBeGreaterThan(0);
      expect(parsed.pools[0]?.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(Array.isArray(parsed.pools[0]?.tokens)).toBe(true);
    },
    { timeout: 30000 },
  );
});
