import { describe, expect, test } from "bun:test";

async function runCliJson<T>(
  args: string[],
  env?: Record<string, string>,
): Promise<T> {
  const proc = Bun.spawn({
    cmd: [process.execPath, "run", "src/index.ts", ...args],
    cwd: process.cwd(),
    env: {
      ...process.env,
      WOOO_OKX_ONCHAIN_API_KEY: "test-api-key",
      WOOO_OKX_ONCHAIN_SECRET: "test-secret",
      WOOO_OKX_ONCHAIN_PASSPHRASE: "test-passphrase",
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

async function withMockOkxOnchain<T>(
  run: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);

      if (
        request.method === "GET" &&
        url.pathname === "/api/v6/dex/market/token/search"
      ) {
        return Response.json({
          code: "0",
          data: [
            {
              chainIndex: "1",
              tokenContractAddress:
                "0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2",
              tokenName: "Wrapped Ether",
              tokenSymbol: "WETH",
              price: "3520.12",
              change: "1.45",
            },
          ],
          msg: "",
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/api/v6/dex/market/token/basic-info"
      ) {
        return Response.json({
          code: "0",
          data: [
            {
              chainIndex: "1",
              tokenContractAddress:
                "0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2",
              tokenName: "Wrapped Ether",
              tokenSymbol: "WETH",
              decimal: "18",
              tagList: { communityRecognized: true },
            },
          ],
          msg: "",
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/api/v6/dex/market/price-info"
      ) {
        return Response.json({
          code: "0",
          data: [
            {
              chainIndex: "1",
              tokenContractAddress:
                "0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2",
              price: "3520.12",
              priceChange24H: "1.45",
              volume24H: "987654.321",
              txs24H: "1234",
              liquidity: "4567890.12",
              marketCap: "1234567890",
              holders: "987654",
              time: "1710000000000",
            },
          ],
          msg: "",
        });
      }

      if (
        request.method === "GET" &&
        url.pathname === "/api/v6/dex/balance/total-value-by-address"
      ) {
        return Response.json({
          code: "0",
          data: [{ totalValue: "4321.987" }],
          msg: "success",
        });
      }

      if (
        request.method === "GET" &&
        url.pathname === "/api/v6/dex/balance/all-token-balances-by-address"
      ) {
        return Response.json({
          code: "0",
          data: [
            {
              tokenAssets: [
                {
                  chainIndex: "1",
                  tokenContractAddress:
                    "0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2",
                  symbol: "WETH",
                  balance: "1.25",
                  tokenPrice: "3520.12",
                  isRiskToken: false,
                },
              ],
            },
          ],
          msg: "success",
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/api/v6/dex/balance/token-balances-by-address"
      ) {
        return Response.json({
          code: "0",
          data: [
            {
              tokenAssets: [
                {
                  chainIndex: "1",
                  tokenContractAddress: "",
                  symbol: "ETH",
                  balance: "0.75",
                  tokenPrice: "3500.00",
                  isRiskToken: false,
                },
              ],
            },
          ],
          msg: "success",
        });
      }

      if (
        request.method === "GET" &&
        url.pathname === "/api/v6/dex/post-transaction/transactions-by-address"
      ) {
        return Response.json({
          code: "0",
          data: [
            {
              cursor: "next-cursor",
              transactionList: [
                {
                  chainIndex: "1",
                  txHash: "0xhistory",
                  txStatus: "success",
                  txTime: "1710000000000",
                  symbol: "WETH",
                  amount: "0.5",
                  from: [{ address: "0xfrom", amount: "0.5" }],
                  to: [{ address: "0xto", amount: "0.5" }],
                },
              ],
            },
          ],
          msg: "success",
        });
      }

      if (
        request.method === "GET" &&
        url.pathname ===
          "/api/v6/dex/post-transaction/transaction-detail-by-txhash"
      ) {
        return Response.json({
          code: "0",
          data: [
            {
              chainIndex: "1",
              txhash: "0xdetail",
              txStatus: "success",
              txTime: "1710000000000",
              symbol: "ETH",
              amount: "0.75",
              txFee: "0.00021",
              height: "12345678",
              methodId: "0xa9059cbb",
              fromDetails: [{ address: "0xfrom", amount: "0.75" }],
              toDetails: [{ address: "0xto", amount: "0.75" }],
            },
          ],
          msg: "success",
        });
      }

      return Response.json(
        { code: "404", msg: "not found", data: [] },
        {
          status: 404,
        },
      );
    },
  });

  try {
    return await run(`http://127.0.0.1:${server.port}`);
  } finally {
    server.stop(true);
  }
}

describe("OKX Onchain CLI commands", () => {
  test("market okx search returns stable JSON output", async () => {
    const parsed = await withMockOkxOnchain((baseUrl) =>
      runCliJson<{
        provider: string;
        query: string;
        chains: string[];
        results: Array<{ tokenSymbol: string; chainIndex: string }>;
      }>(
        [
          "market",
          "okx",
          "search",
          "weth",
          "--chains",
          "ethereum,optimism",
          "--json",
        ],
        { WOOO_OKX_ONCHAIN_BASE_URL: baseUrl },
      ),
    );

    expect(parsed.provider).toBe("okx-onchain");
    expect(parsed.query).toBe("weth");
    expect(parsed.chains).toEqual(["1", "10"]);
    expect(parsed.results[0]?.tokenSymbol).toBe("WETH");
    expect(parsed.results[0]?.chainIndex).toBe("1");
  });

  test("market okx token and metrics return machine-readable payloads", async () => {
    const token = await withMockOkxOnchain((baseUrl) =>
      runCliJson<{
        provider: string;
        chain: string;
        token: { tokenSymbol: string; decimal: string };
      }>(
        [
          "market",
          "okx",
          "token",
          "ethereum",
          "0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2",
          "--json",
        ],
        { WOOO_OKX_ONCHAIN_BASE_URL: baseUrl },
      ),
    );
    const metrics = await withMockOkxOnchain((baseUrl) =>
      runCliJson<{
        provider: string;
        chain: string;
        metrics: { price: string; txs24H: string };
      }>(
        [
          "market",
          "okx",
          "metrics",
          "ethereum",
          "0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2",
          "--json",
        ],
        { WOOO_OKX_ONCHAIN_BASE_URL: baseUrl },
      ),
    );

    expect(token.provider).toBe("okx-onchain");
    expect(token.chain).toBe("1");
    expect(token.token.tokenSymbol).toBe("WETH");
    expect(token.token.decimal).toBe("18");
    expect(metrics.provider).toBe("okx-onchain");
    expect(metrics.metrics.price).toBe("3520.12");
    expect(metrics.metrics.txs24H).toBe("1234");
  });

  test("portfolio okx value, balances, and balance return stable JSON output", async () => {
    const value = await withMockOkxOnchain((baseUrl) =>
      runCliJson<{
        provider: string;
        totalValue: string;
        assetType: string;
      }>(
        [
          "portfolio",
          "okx",
          "value",
          "0xabc",
          "--chains",
          "ethereum,base",
          "--json",
        ],
        { WOOO_OKX_ONCHAIN_BASE_URL: baseUrl },
      ),
    );
    const balances = await withMockOkxOnchain((baseUrl) =>
      runCliJson<{
        provider: string;
        balances: Array<{ symbol: string; balance: string }>;
      }>(
        [
          "portfolio",
          "okx",
          "balances",
          "0xabc",
          "--chains",
          "ethereum",
          "--json",
        ],
        { WOOO_OKX_ONCHAIN_BASE_URL: baseUrl },
      ),
    );
    const balance = await withMockOkxOnchain((baseUrl) =>
      runCliJson<{
        provider: string;
        balance: { symbol: string; tokenContractAddress: string };
      }>(
        [
          "portfolio",
          "okx",
          "balance",
          "0xabc",
          "ethereum",
          "native",
          "--json",
        ],
        { WOOO_OKX_ONCHAIN_BASE_URL: baseUrl },
      ),
    );

    expect(value.provider).toBe("okx-onchain");
    expect(value.totalValue).toBe("4321.987");
    expect(value.assetType).toBe("all");
    expect(balances.balances[0]?.symbol).toBe("WETH");
    expect(balances.balances[0]?.balance).toBe("1.25");
    expect(balance.balance.symbol).toBe("ETH");
    expect(balance.balance.tokenContractAddress).toBe("");
  });

  test("chain okx history and tx return stable JSON output", async () => {
    const history = await withMockOkxOnchain((baseUrl) =>
      runCliJson<{
        provider: string;
        cursor: string;
        transactions: Array<{ txHash: string; symbol: string }>;
      }>(
        ["chain", "okx", "history", "0xabc", "--chains", "ethereum", "--json"],
        { WOOO_OKX_ONCHAIN_BASE_URL: baseUrl },
      ),
    );
    const tx = await withMockOkxOnchain((baseUrl) =>
      runCliJson<{
        provider: string;
        chain: string;
        transaction: { txhash: string; methodId: string };
      }>(["chain", "okx", "tx", "ethereum", "0xdetail", "--json"], {
        WOOO_OKX_ONCHAIN_BASE_URL: baseUrl,
      }),
    );

    expect(history.provider).toBe("okx-onchain");
    expect(history.cursor).toBe("next-cursor");
    expect(history.transactions[0]?.txHash).toBe("0xhistory");
    expect(history.transactions[0]?.symbol).toBe("WETH");
    expect(tx.provider).toBe("okx-onchain");
    expect(tx.chain).toBe("1");
    expect(tx.transaction.txhash).toBe("0xdetail");
    expect(tx.transaction.methodId).toBe("0xa9059cbb");
  });
});
