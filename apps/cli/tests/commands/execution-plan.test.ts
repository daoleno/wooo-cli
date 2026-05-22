import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { blueAbi } from "@morpho-org/blue-sdk-viem";
import { $ } from "bun";
import {
  decodeFunctionData,
  encodeFunctionResult,
  erc20Abi,
  parseUnits,
  zeroAddress,
} from "viem";
import { CURVE_POOL_ABI } from "../../src/protocols/curve/constants";
import { QUOTER_V2_ABI } from "../../src/protocols/uniswap/constants";

const MORPHO_ETHEREUM_WSTETH_USDC_MARKET =
  "0xb323495f7e4148be5643a4ea4a8221eef163e4bccfdedc2a6f4696baacbc86cc";
const MOCK_POLYMARKET_TOKEN_ID = "123456789";
const MOCK_MORPHO_LOAN_TOKEN = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const MOCK_MORPHO_COLLATERAL_TOKEN =
  "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

interface JsonRpcRequest {
  id?: number | string | null;
  method?: string;
  params?: unknown[];
}

function asJsonRpcRequest(value: unknown): JsonRpcRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as JsonRpcRequest;
}

function rpcResult(id: JsonRpcRequest["id"], result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(
  id: JsonRpcRequest["id"],
  message = "mock rpc unsupported call",
) {
  return { jsonrpc: "2.0", id, error: { code: -32000, message } };
}

function getCallData(request: JsonRpcRequest): {
  data?: `0x${string}`;
  to: string;
} {
  const tx = request.params?.[0];
  if (!tx || typeof tx !== "object" || Array.isArray(tx)) {
    return { to: "" };
  }

  const record = tx as Record<string, unknown>;
  const data = typeof record.data === "string" ? record.data : undefined;
  const to = typeof record.to === "string" ? record.to.toLowerCase() : "";
  return { data: data as `0x${string}` | undefined, to };
}

function handleMorphoRpcCall(rawCall: unknown) {
  const call = asJsonRpcRequest(rawCall);
  const id = call.id;

  if (call.method === "eth_chainId") {
    return rpcResult(id, "0x1");
  }

  if (call.method !== "eth_call") {
    return rpcError(id, `unsupported method ${call.method ?? "<missing>"}`);
  }

  const { data, to } = getCallData(call);
  if (!data) {
    return rpcError(id, "missing call data");
  }

  try {
    const decoded = decodeFunctionData({ abi: blueAbi, data });
    if (decoded.functionName === "idToMarketParams") {
      return rpcResult(
        id,
        encodeFunctionResult({
          abi: blueAbi,
          functionName: "idToMarketParams",
          result: [
            MOCK_MORPHO_LOAN_TOKEN,
            MOCK_MORPHO_COLLATERAL_TOKEN,
            zeroAddress,
            zeroAddress,
            860000000000000000n,
          ],
        }),
      );
    }

    if (decoded.functionName === "market") {
      return rpcResult(
        id,
        encodeFunctionResult({
          abi: blueAbi,
          functionName: "market",
          result: [
            parseUnits("1000000", 6),
            parseUnits("1000000", 6),
            parseUnits("100000", 6),
            parseUnits("100000", 6),
            1n,
            0n,
          ],
        }),
      );
    }
  } catch {}

  try {
    const decoded = decodeFunctionData({ abi: erc20Abi, data });
    const isLoanToken = to === MOCK_MORPHO_LOAN_TOKEN.toLowerCase();

    if (decoded.functionName === "decimals") {
      return rpcResult(
        id,
        encodeFunctionResult({
          abi: erc20Abi,
          functionName: "decimals",
          result: isLoanToken ? 6 : 18,
        }),
      );
    }

    if (decoded.functionName === "symbol") {
      return rpcResult(
        id,
        encodeFunctionResult({
          abi: erc20Abi,
          functionName: "symbol",
          result: isLoanToken ? "USDC" : "WETH",
        }),
      );
    }

    if (decoded.functionName === "name") {
      return rpcResult(
        id,
        encodeFunctionResult({
          abi: erc20Abi,
          functionName: "name",
          result: isLoanToken ? "USD Coin" : "Wrapped Ether",
        }),
      );
    }
  } catch {}

  return rpcError(id);
}

function handleEvmQuoteRpcCall(rawCall: unknown) {
  const call = asJsonRpcRequest(rawCall);
  const id = call.id;

  if (call.method === "eth_chainId") {
    return rpcResult(id, "0x1");
  }

  if (call.method !== "eth_call") {
    return rpcError(id, `unsupported method ${call.method ?? "<missing>"}`);
  }

  const { data } = getCallData(call);
  if (!data) {
    return rpcError(id, "missing call data");
  }

  try {
    const decoded = decodeFunctionData({ abi: CURVE_POOL_ABI, data });
    if (decoded.functionName === "get_dy") {
      return rpcResult(
        id,
        encodeFunctionResult({
          abi: CURVE_POOL_ABI,
          functionName: "get_dy",
          result: parseUnits("99.75", 6),
        }),
      );
    }
  } catch {}

  try {
    const decoded = decodeFunctionData({ abi: QUOTER_V2_ABI, data });
    if (decoded.functionName === "quoteExactInputSingle") {
      const params = decoded.args[0];
      const fee = params.fee;
      const amountOut =
        fee === 500 ? parseUnits("99.5", 6) : parseUnits("98.9", 6);

      return rpcResult(
        id,
        encodeFunctionResult({
          abi: QUOTER_V2_ABI,
          functionName: "quoteExactInputSingle",
          result: [amountOut, 0n, 0, 150000n],
        }),
      );
    }
  } catch {}

  return rpcError(id);
}

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

async function withMockMorphoRpc<T>(
  run: (env: Record<string, string>) => Promise<T>,
): Promise<T> {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const body = await request.json();
      const response = Array.isArray(body)
        ? body.map(handleMorphoRpcCall)
        : handleMorphoRpcCall(body);
      return Response.json(response);
    },
  });
  const configDir = mkdtempSync(join(tmpdir(), "wooo-morpho-"));
  writeFileSync(
    join(configDir, "wooo.config.json"),
    JSON.stringify(
      {
        chains: {
          ethereum: { rpc: `http://127.0.0.1:${server.port}` },
        },
      },
      null,
      2,
    ),
  );

  try {
    return await run({ WOOO_CONFIG_DIR: configDir });
  } finally {
    server.stop(true);
    rmSync(configDir, { recursive: true, force: true });
  }
}

async function withMockEthereumQuoteRpc<T>(
  run: (env: Record<string, string>) => Promise<T>,
): Promise<T> {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const body = await request.json();
      const response = Array.isArray(body)
        ? body.map(handleEvmQuoteRpcCall)
        : handleEvmQuoteRpcCall(body);
      return Response.json(response);
    },
  });
  const configDir = mkdtempSync(join(tmpdir(), "wooo-evm-quote-"));
  writeFileSync(
    join(configDir, "wooo.config.json"),
    JSON.stringify(
      {
        chains: {
          ethereum: { rpc: `http://127.0.0.1:${server.port}` },
        },
      },
      null,
      2,
    ),
  );

  try {
    return await run({ WOOO_CONFIG_DIR: configDir });
  } finally {
    server.stop(true);
    rmSync(configDir, { recursive: true, force: true });
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
      const parsed = await withMockEthereumQuoteRpc((env) =>
        runCliJson<{
          kind: string;
          operation: { group: string; protocol: string; command: string };
          chain: string;
          steps: Array<{ kind: string }>;
        }>(
          [
            "dex",
            "curve",
            "swap",
            "USDC",
            "USDT",
            "100",
            "--chain",
            "ethereum",
            "--dry-run",
            "--json",
          ],
          env,
        ),
      );

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
      const parsed = await withMockEthereumQuoteRpc((env) =>
        runCliJson<{
          kind: string;
          operation: { group: string; protocol: string; command: string };
          metadata?: {
            bestRoute?: string;
            quotes?: Array<{ protocol: string }>;
          };
          warnings: string[];
        }>(
          [
            "swap",
            "USDC",
            "USDT",
            "100",
            "--chain",
            "ethereum",
            "--dry-run",
            "--json",
          ],
          env,
        ),
      );

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

  test("chain transfer returns an execution plan", async () => {
    const result =
      await $`bun run src/index.ts chain transfer 0x1111111111111111111111111111111111111111 0.1 --chain ethereum --dry-run --json`.text();
    const parsed = JSON.parse(result) as {
      kind: string;
      operation: { group: string; protocol: string; command: string };
      chain: string;
      steps: Array<{ kind: string }>;
      metadata?: { assetType?: string; recipient?: string; token?: string };
    };

    expect(parsed.kind).toBe("execution-plan");
    expect(parsed.operation.group).toBe("chain");
    expect(parsed.operation.protocol).toBe("chain");
    expect(parsed.operation.command).toBe("transfer");
    expect(parsed.chain).toBe("ethereum");
    expect(parsed.steps).toHaveLength(1);
    expect(parsed.steps[0]?.kind).toBe("transaction");
    expect(parsed.metadata?.assetType).toBe("native");
    expect(parsed.metadata?.token).toBe("ETH");
    expect(parsed.metadata?.recipient).toBe(
      "0x1111111111111111111111111111111111111111",
    );
  });

  test("chain approve returns an execution plan", async () => {
    const result =
      await $`bun run src/index.ts chain approve USDC 0x1111111111111111111111111111111111111111 25 --chain ethereum --dry-run --json`.text();
    const parsed = JSON.parse(result) as {
      kind: string;
      operation: { group: string; protocol: string; command: string };
      chain: string;
      steps: Array<{ kind: string }>;
      metadata?: {
        spender?: string;
        token?: string;
        amount?: string;
        isMaxApproval?: boolean;
      };
    };

    expect(parsed.kind).toBe("execution-plan");
    expect(parsed.operation.group).toBe("chain");
    expect(parsed.operation.protocol).toBe("chain");
    expect(parsed.operation.command).toBe("approve");
    expect(parsed.chain).toBe("ethereum");
    expect(parsed.steps).toHaveLength(1);
    expect(parsed.steps[0]?.kind).toBe("approval");
    expect(parsed.metadata?.token).toBe("USDC");
    expect(parsed.metadata?.amount).toBe("25");
    expect(parsed.metadata?.spender).toBe(
      "0x1111111111111111111111111111111111111111",
    );
    expect(parsed.metadata?.isMaxApproval).toBe(false);
  });

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
      const parsed = await withMockMorphoRpc((env) =>
        runCliJson<{
          kind: string;
          operation: { group: string; protocol: string; command: string };
          chain: string;
          accountType: string;
          steps: Array<{ kind: string }>;
        }>(
          [
            "lend",
            "morpho",
            "supply",
            MORPHO_ETHEREUM_WSTETH_USDC_MARKET,
            "100",
            "--chain",
            "ethereum",
            "--dry-run",
            "--json",
          ],
          env,
        ),
      );

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
      const parsed = await withMockMorphoRpc((env) =>
        runCliJson<{
          kind: string;
          operation: { group: string; protocol: string; command: string };
          chain: string;
          accountType: string;
          steps: Array<{ kind: string }>;
        }>(
          [
            "lend",
            "morpho",
            "borrow",
            MORPHO_ETHEREUM_WSTETH_USDC_MARKET,
            "10",
            "--chain",
            "ethereum",
            "--dry-run",
            "--json",
          ],
          env,
        ),
      );

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
