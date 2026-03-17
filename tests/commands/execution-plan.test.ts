import { describe, expect, test } from "bun:test";
import { $ } from "bun";

const MORPHO_ETHEREUM_WSTETH_USDC_MARKET =
  "0xb323495f7e4148be5643a4ea4a8221eef163e4bccfdedc2a6f4696baacbc86cc";
const MOCK_POLYMARKET_TOKEN_ID = "123456789";

async function runCliJson<T>(
  args: string[],
  env?: Record<string, string>,
): Promise<T> {
  const proc = Bun.spawn({
    cmd: [process.execPath, "run", "src/index.ts", ...args],
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...env,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(
      `Command failed with exit code ${exitCode}: bun run src/index.ts ${args.join(
        " ",
      )}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
    );
  }

  return JSON.parse(stdout) as T;
}

async function withMockPolymarketClob<T>(
  run: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const url = new URL(request.url);

      if (request.method === "GET" && url.pathname === "/tick-size") {
        return Response.json({ minimum_tick_size: "0.01" });
      }

      if (request.method === "GET" && url.pathname === "/neg-risk") {
        return Response.json({ neg_risk: false });
      }

      return Response.json({ error: "not found" }, { status: 404 });
    },
  });

  try {
    return await run(`http://127.0.0.1:${server.port}`);
  } finally {
    server.stop(true);
  }
}

describe("execution plan dry-run output", () => {
  test("aave supply returns an execution plan", async () => {
    const result =
      await $`bun run src/index.ts lend aave supply USDC 100 --chain ethereum --market AaveV3Ethereum --dry-run --json`.text();
    const parsed = JSON.parse(result) as {
      kind: string;
      operation: { group: string; protocol: string; command: string };
      chain: string;
      steps: Array<{ kind: string }>;
    };

    expect(parsed.kind).toBe("execution-plan");
    expect(parsed.operation.group).toBe("lend");
    expect(parsed.operation.protocol).toBe("aave");
    expect(parsed.operation.command).toBe("supply");
    expect(parsed.chain).toBe("ethereum");
    expect(parsed.steps[0]?.kind).toBe("approval");
    expect(parsed.steps[1]?.kind).toBe("transaction");
  });

  test("aave repay returns an execution plan", async () => {
    const result =
      await $`bun run src/index.ts lend aave repay USDC 100 --chain ethereum --market AaveV3Ethereum --dry-run --json`.text();
    const parsed = JSON.parse(result) as {
      kind: string;
      operation: { group: string; protocol: string; command: string };
      chain: string;
      steps: Array<{ kind: string }>;
    };

    expect(parsed.kind).toBe("execution-plan");
    expect(parsed.operation.group).toBe("lend");
    expect(parsed.operation.protocol).toBe("aave");
    expect(parsed.operation.command).toBe("repay");
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
        operation: { group: string; protocol: string; command: string };
        chain: string;
        steps: Array<{ kind: string }>;
      };

      expect(parsed.kind).toBe("execution-plan");
      expect(parsed.operation.group).toBe("dex");
      expect(parsed.operation.protocol).toBe("curve");
      expect(parsed.operation.command).toBe("swap");
      expect(parsed.chain).toBe("ethereum");
      expect(parsed.steps[0]?.kind).toBe("approval");
      expect(parsed.steps[1]?.kind).toBe("transaction");
    },
    { timeout: 60000 },
  );

  test(
    "jupiter swap returns an execution plan",
    async () => {
      const result =
        await $`bun run src/index.ts dex jupiter swap SOL USDC 0.1 --dry-run --json`.text();
      const parsed = JSON.parse(result) as {
        kind: string;
        operation: { group: string; protocol: string; command: string };
        chain: string;
        accountType: string;
        steps: Array<{ kind: string }>;
      };

      expect(parsed.kind).toBe("execution-plan");
      expect(parsed.operation.group).toBe("dex");
      expect(parsed.operation.protocol).toBe("jupiter");
      expect(parsed.operation.command).toBe("swap");
      expect(parsed.chain).toBe("solana");
      expect(parsed.accountType).toBe("solana");
      expect(parsed.steps[0]?.kind).toBe("transaction");
    },
    { timeout: 60000 },
  );

  test(
    "aggregated EVM swap returns the selected route execution plan",
    async () => {
      const result =
        await $`bun run src/index.ts swap USDC USDT 100 --chain ethereum --dry-run --json`.text();
      const parsed = JSON.parse(result) as {
        kind: string;
        operation: { group: string; protocol: string; command: string };
        metadata?: { bestRoute?: string; quotes?: Array<{ protocol: string }> };
        warnings: string[];
      };

      expect(parsed.kind).toBe("execution-plan");
      expect(parsed.operation.group).toBe("dex");
      expect(parsed.operation.command).toBe("swap");
      expect(["curve", "uniswap"]).toContain(parsed.operation.protocol);
      expect(parsed.metadata?.bestRoute).toBe(parsed.operation.protocol);
      expect(parsed.metadata?.quotes?.length).toBeGreaterThan(0);
      expect(parsed.warnings).toContain(
        "This plan was selected by the aggregated swap router.",
      );
    },
    { timeout: 60000 },
  );

  test("lido stake returns an execution plan", async () => {
    const result =
      await $`bun run src/index.ts stake lido stake 1 --dry-run --json`.text();
    const parsed = JSON.parse(result) as {
      kind: string;
      operation: { group: string; protocol: string; command: string };
      chain: string;
      steps: Array<{ kind: string }>;
    };

    expect(parsed.kind).toBe("execution-plan");
    expect(parsed.operation.group).toBe("stake");
    expect(parsed.operation.protocol).toBe("lido");
    expect(parsed.operation.command).toBe("stake");
    expect(parsed.chain).toBe("ethereum");
    expect(parsed.steps).toHaveLength(1);
    expect(parsed.steps[0]?.kind).toBe("transaction");
  });

  test(
    "polymarket approval returns an execution plan",
    async () => {
      const result =
        await $`bun run src/index.ts prediction polymarket approve set --dry-run --json`.text();
      const parsed = JSON.parse(result) as {
        kind: string;
        operation: { group: string; protocol: string; command: string };
        chain: string;
        accountType: string;
        steps: Array<{ kind: string }>;
      };

      expect(parsed.kind).toBe("execution-plan");
      expect(parsed.operation.group).toBe("prediction");
      expect(parsed.operation.protocol).toBe("polymarket");
      expect(parsed.operation.command).toBe("approve");
      expect(parsed.chain).toBe("polygon");
      expect(parsed.accountType).toBe("evm");
      expect(parsed.steps.length).toBeGreaterThanOrEqual(4);
      expect(parsed.steps.every((step) => step.kind === "approval")).toBe(true);
    },
    { timeout: 60000 },
  );

  test(
    "polymarket create-order returns an execution plan",
    async () => {
      const parsed = await withMockPolymarketClob((baseUrl) =>
        runCliJson<{
          kind: string;
          operation: { group: string; protocol: string; command: string };
          chain: string;
          accountType: string;
          steps: Array<{ kind: string }>;
        }>(
          [
            "prediction",
            "polymarket",
            "clob",
            "create-order",
            "--token",
            MOCK_POLYMARKET_TOKEN_ID,
            "--side",
            "buy",
            "--price",
            "0.5",
            "--size",
            "1",
            "--dry-run",
            "--json",
          ],
          { WOOO_POLYMARKET_CLOB_URL: baseUrl },
        ),
      );

      expect(parsed.kind).toBe("execution-plan");
      expect(parsed.operation.group).toBe("prediction");
      expect(parsed.operation.protocol).toBe("polymarket");
      expect(parsed.operation.command).toBe("create-order");
      expect(parsed.chain).toBe("polygon");
      expect(parsed.accountType).toBe("evm");
      expect(parsed.steps).toHaveLength(2);
      expect(parsed.steps[0]?.kind).toBe("transaction");
      expect(parsed.steps[1]?.kind).toBe("transaction");
    },
    { timeout: 60000 },
  );

  test(
    "polymarket market-order returns an execution plan",
    async () => {
      const parsed = await withMockPolymarketClob((baseUrl) =>
        runCliJson<{
          kind: string;
          operation: { group: string; protocol: string; command: string };
          chain: string;
          accountType: string;
          steps: Array<{ kind: string }>;
        }>(
          [
            "prediction",
            "polymarket",
            "clob",
            "market-order",
            "--token",
            MOCK_POLYMARKET_TOKEN_ID,
            "--side",
            "buy",
            "--amount",
            "1",
            "--dry-run",
            "--json",
          ],
          { WOOO_POLYMARKET_CLOB_URL: baseUrl },
        ),
      );

      expect(parsed.kind).toBe("execution-plan");
      expect(parsed.operation.group).toBe("prediction");
      expect(parsed.operation.protocol).toBe("polymarket");
      expect(parsed.operation.command).toBe("market-order");
      expect(parsed.chain).toBe("polygon");
      expect(parsed.accountType).toBe("evm");
      expect(parsed.steps).toHaveLength(2);
      expect(parsed.steps[0]?.kind).toBe("transaction");
      expect(parsed.steps[1]?.kind).toBe("transaction");
    },
    { timeout: 60000 },
  );

  test(
    "morpho supply returns an execution plan",
    async () => {
      const result =
        await $`bun run src/index.ts lend morpho supply ${MORPHO_ETHEREUM_WSTETH_USDC_MARKET} 100 --chain ethereum --dry-run --json`.text();
      const parsed = JSON.parse(result) as {
        kind: string;
        operation: { group: string; protocol: string; command: string };
        chain: string;
        accountType: string;
        steps: Array<{ kind: string }>;
      };

      expect(parsed.kind).toBe("execution-plan");
      expect(parsed.operation.group).toBe("lend");
      expect(parsed.operation.protocol).toBe("morpho");
      expect(parsed.operation.command).toBe("supply");
      expect(parsed.chain).toBe("ethereum");
      expect(parsed.accountType).toBe("evm");
      expect(parsed.steps[0]?.kind).toBe("approval");
      expect(parsed.steps[1]?.kind).toBe("transaction");
    },
    { timeout: 60000 },
  );

  test(
    "morpho borrow returns an execution plan",
    async () => {
      const result =
        await $`bun run src/index.ts lend morpho borrow ${MORPHO_ETHEREUM_WSTETH_USDC_MARKET} 10 --chain ethereum --dry-run --json`.text();
      const parsed = JSON.parse(result) as {
        kind: string;
        operation: { group: string; protocol: string; command: string };
        chain: string;
        accountType: string;
        steps: Array<{ kind: string }>;
      };

      expect(parsed.kind).toBe("execution-plan");
      expect(parsed.operation.group).toBe("lend");
      expect(parsed.operation.protocol).toBe("morpho");
      expect(parsed.operation.command).toBe("borrow");
      expect(parsed.chain).toBe("ethereum");
      expect(parsed.accountType).toBe("evm");
      expect(parsed.steps).toHaveLength(1);
      expect(parsed.steps[0]?.kind).toBe("transaction");
    },
    { timeout: 60000 },
  );

  test(
    "aave markets json returns stable machine-readable output",
    async () => {
      const result =
        await $`bun run src/index.ts lend aave markets --chain ethereum --json`.text();
      const parsed = JSON.parse(result) as {
        chain: string;
        markets: Array<{
          market: string;
          token: string;
          tokenAddress: string;
          supplyAPY: string;
          variableBorrowAPY: string;
          active: boolean;
        }>;
      };

      expect(parsed.chain).toBe("ethereum");
      expect(parsed.markets.length).toBeGreaterThan(0);
      expect(parsed.markets[0]?.market).toContain("AaveV3Ethereum");
      expect(parsed.markets[0]?.tokenAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(typeof parsed.markets[0]?.active).toBe("boolean");
      expect(parsed.markets[0]?.supplyAPY).toContain("%");
    },
    { timeout: 60000 },
  );

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
