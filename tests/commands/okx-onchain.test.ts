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
        url.pathname === "/api/v6/dex/market/trades"
      ) {
        return Response.json({
          code: "0",
          data: [
            {
              id: "trade-1",
              chainIndex: "1",
              tokenContractAddress: "0xc02aa39b223fe8d0a0e5c4f27ead9083c756cc2",
              txHashUrl: "https://example.com/tx/trade-1",
              userAddress: "0xtrader",
              dexName: "Uniswap",
              type: "buy",
              changedTokenInfo: [
                {
                  amount: "1.5",
                  tokenSymbol: "WETH",
                  tokenContractAddress:
                    "0xc02aa39b223fe8d0a0e5c4f27ead9083c756cc2",
                },
                {
                  amount: "5280.18",
                  tokenSymbol: "USDC",
                  tokenContractAddress:
                    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
                },
              ],
              price: "3520.12",
              volume: "5280.18",
              time: "1710000060000",
              isFiltered: "0",
            },
          ],
          msg: "",
        });
      }

      if (
        request.method === "GET" &&
        url.pathname === "/api/v6/dex/market/historical-candles"
      ) {
        return Response.json({
          code: "0",
          data: [
            ["1710000000000", "10", "12", "9", "11", "100", "1100", "1"],
            ["1709999940000", "11", "13", "10", "12", "90", "1000", "0"],
          ],
          msg: "",
        });
      }

      if (
        request.method === "GET" &&
        url.pathname === "/api/v6/dex/market/token/holder"
      ) {
        return Response.json({
          code: "0",
          data: [
            {
              holderWalletAddress: "0xholder",
              holdAmount: "1500",
              holdPercent: "12.5",
              totalPnlUsd: "2300",
              realizedPnlUsd: "1200",
              unrealizedPnlUsd: "1100",
              fundingSource: "0xfunding",
            },
          ],
          msg: "",
        });
      }

      if (
        request.method === "GET" &&
        url.pathname === "/api/v6/dex/market/token/toplist"
      ) {
        return Response.json({
          code: "0",
          data: [
            {
              chainIndex: "1",
              tokenSymbol: "WETH",
              tokenContractAddress: "0xc02aa39b223fe8d0a0e5c4f27ead9083c756cc2",
              marketCap: "1234567890",
              volume: "7654321",
              firstTradeTime: "1610000000000",
              change: "2.5",
              liquidity: "4567890",
              price: "3520.12",
              holders: "987654",
              uniqueTraders: "1234",
              txsBuy: "700",
              txsSell: "534",
              txs: "1234",
            },
          ],
          msg: "",
        });
      }

      if (
        request.method === "GET" &&
        url.pathname === "/api/v6/dex/market/portfolio/supported/chain"
      ) {
        return Response.json({
          code: "0",
          data: [
            {
              chainIndex: "1",
              chainName: "Ethereum",
              chainLogo: "https://example.com/eth.png",
            },
          ],
          msg: "",
        });
      }

      if (
        request.method === "GET" &&
        url.pathname === "/api/v6/dex/market/portfolio/overview"
      ) {
        return Response.json({
          code: "0",
          data: {
            realizedPnlUsd: "1500.00",
            top3PnlTokenSumUsd: "900.00",
            top3PnlTokenPercent: "62.5",
            topPnlTokenList: [
              {
                tokenContractAddress:
                  "0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2",
                tokenSymbol: "WETH",
                tokenPnLUsd: "500.00",
                tokenPnLPercent: "25.0",
              },
            ],
            winRate: "0.65",
            tokenCountByPnlPercent: {
              over500Percent: "1",
              zeroTo500Percent: "8",
              zeroToMinus50Percent: "3",
              overMinus50Percent: "1",
            },
            buyTxCount: "50",
            buyTxVolume: "8000.00",
            sellTxCount: "20",
            sellTxVolume: "4200.00",
            avgBuyValueUsd: "160.00",
            preferredMarketCap: "Large",
            buysByMarketCap: [
              {
                marketCapRange: "Large",
                buyCount: "18",
              },
            ],
          },
          msg: "",
        });
      }

      if (
        request.method === "GET" &&
        url.pathname === "/api/v6/dex/market/portfolio/recent-pnl"
      ) {
        return Response.json({
          code: "0",
          data: {
            cursor: "portfolio-cursor",
            pnlList: [
              {
                chainIndex: "1",
                tokenContractAddress:
                  "0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2",
                tokenSymbol: "WETH",
                lastActiveTimestamp: "1710000060000",
                unrealizedPnlUsd: "100.00",
                unrealizedPnlPercent: "10.00",
                realizedPnlUsd: "200.00",
                realizedPnlPercent: "20.00",
                totalPnlUsd: "300.00",
                totalPnlPercent: "30.00",
                tokenBalanceUsd: "1000.00",
                tokenBalanceAmount: "1.0",
                tokenPositionPercent: "10.00",
                tokenPositionDuration: {
                  holdingTimestamp: "1700000000000",
                  sellOffTimestamp: "",
                },
                buyTxCount: "5",
                buyTxVolume: "900.00",
                buyAvgPrice: "0.99",
                sellTxCount: "2",
                sellTxVolume: "400.00",
                sellAvgPrice: "1.01",
              },
            ],
          },
          msg: "",
        });
      }

      if (
        request.method === "GET" &&
        url.pathname === "/api/v6/dex/market/portfolio/token/latest-pnl"
      ) {
        return Response.json({
          code: 0,
          data: {
            totalPnlUsd: "1371.68",
            totalPnlPercent: "20.22",
            unrealizedPnlUsd: "685.4",
            unrealizedPnlPercent: "10.11",
            realizedPnlUsd: "-685.4",
            realizedPnlPercent: "-10.11",
            isPnlSupported: true,
          },
          msg: "",
        });
      }

      if (
        request.method === "GET" &&
        url.pathname === "/api/v6/dex/market/portfolio/dex-history"
      ) {
        return Response.json({
          code: "0",
          data: {
            transactionList: [
              {
                type: "1",
                chainIndex: "1",
                tokenContractAddress:
                  "0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2",
                tokenSymbol: "WETH",
                valueUsd: "1000.00",
                amount: "0.4",
                price: "2500.00",
                marketCap: "1000000000",
                pnlUsd: "50.00",
                time: "1710000100000",
              },
            ],
            cursor: "dex-history-cursor",
          },
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

  test("market okx trades, candles, holders, and ranking return stable JSON output", async () => {
    const trades = await withMockOkxOnchain((baseUrl) =>
      runCliJson<{
        provider: string;
        chain: string;
        trades: Array<{
          id: string;
          dexName: string;
          changedTokenInfo: Array<{ tokenSymbol: string }>;
        }>;
      }>(
        [
          "market",
          "okx",
          "trades",
          "ethereum",
          "0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2",
          "--json",
        ],
        { WOOO_OKX_ONCHAIN_BASE_URL: baseUrl },
      ),
    );
    const candles = await withMockOkxOnchain((baseUrl) =>
      runCliJson<{
        provider: string;
        chain: string;
        bar: string;
        candles: Array<{ timestamp: string; close: string; confirm: string }>;
      }>(
        [
          "market",
          "okx",
          "candles",
          "ethereum",
          "0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2",
          "--bar",
          "1m",
          "--json",
        ],
        { WOOO_OKX_ONCHAIN_BASE_URL: baseUrl },
      ),
    );
    const holders = await withMockOkxOnchain((baseUrl) =>
      runCliJson<{
        provider: string;
        chain: string;
        holders: Array<{ holderWalletAddress: string; holdPercent: string }>;
      }>(
        [
          "market",
          "okx",
          "holders",
          "ethereum",
          "0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2",
          "--json",
        ],
        { WOOO_OKX_ONCHAIN_BASE_URL: baseUrl },
      ),
    );
    const ranking = await withMockOkxOnchain((baseUrl) =>
      runCliJson<{
        provider: string;
        chains: string[];
        sort: string;
        window: string;
        ranking: Array<{ tokenSymbol: string; txs: string }>;
      }>(
        [
          "market",
          "okx",
          "ranking",
          "--chains",
          "ethereum,base",
          "--sort",
          "volume",
          "--window",
          "24h",
          "--json",
        ],
        { WOOO_OKX_ONCHAIN_BASE_URL: baseUrl },
      ),
    );

    expect(trades.provider).toBe("okx-onchain");
    expect(trades.chain).toBe("1");
    expect(trades.trades[0]?.id).toBe("trade-1");
    expect(trades.trades[0]?.dexName).toBe("Uniswap");
    expect(trades.trades[0]?.changedTokenInfo[0]?.tokenSymbol).toBe("WETH");

    expect(candles.provider).toBe("okx-onchain");
    expect(candles.chain).toBe("1");
    expect(candles.bar).toBe("1m");
    expect(candles.candles[0]?.timestamp).toBe("1710000000000");
    expect(candles.candles[0]?.close).toBe("11");
    expect(candles.candles[0]?.confirm).toBe("1");

    expect(holders.provider).toBe("okx-onchain");
    expect(holders.chain).toBe("1");
    expect(holders.holders[0]?.holderWalletAddress).toBe("0xholder");
    expect(holders.holders[0]?.holdPercent).toBe("12.5");

    expect(ranking.provider).toBe("okx-onchain");
    expect(ranking.chains).toEqual(["1", "8453"]);
    expect(ranking.sort).toBe("volume");
    expect(ranking.window).toBe("24h");
    expect(ranking.ranking[0]?.tokenSymbol).toBe("WETH");
    expect(ranking.ranking[0]?.txs).toBe("1234");
  });

  test("portfolio okx chains, overview, recent-pnl, latest-pnl, and dex-history return stable JSON output", async () => {
    const chains = await withMockOkxOnchain((baseUrl) =>
      runCliJson<{
        provider: string;
        chains: Array<{ chainIndex: string; name: string }>;
      }>(["portfolio", "okx", "chains", "--json"], {
        WOOO_OKX_ONCHAIN_BASE_URL: baseUrl,
      }),
    );
    const overview = await withMockOkxOnchain((baseUrl) =>
      runCliJson<{
        provider: string;
        chain: string;
        window: string;
        timeFrame: string;
        overview: {
          realizedPnlUsd: string;
          topPnlTokenList: Array<{ tokenSymbol: string }>;
          preferredMarketCap: string;
        };
      }>(
        [
          "portfolio",
          "okx",
          "overview",
          "0xabc",
          "ethereum",
          "--window",
          "7d",
          "--json",
        ],
        { WOOO_OKX_ONCHAIN_BASE_URL: baseUrl },
      ),
    );
    const recentPnl = await withMockOkxOnchain((baseUrl) =>
      runCliJson<{
        provider: string;
        chain: string;
        cursor: string;
        recentPnl: Array<{ tokenSymbol: string; totalPnlUsd: string }>;
      }>(
        [
          "portfolio",
          "okx",
          "recent-pnl",
          "0xabc",
          "ethereum",
          "--limit",
          "10",
          "--json",
        ],
        { WOOO_OKX_ONCHAIN_BASE_URL: baseUrl },
      ),
    );
    const latestPnl = await withMockOkxOnchain((baseUrl) =>
      runCliJson<{
        provider: string;
        chain: string;
        token: string;
        pnl: { totalPnlUsd: string; isPnlSupported: boolean };
      }>(
        [
          "portfolio",
          "okx",
          "latest-pnl",
          "0xabc",
          "ethereum",
          "0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2",
          "--json",
        ],
        { WOOO_OKX_ONCHAIN_BASE_URL: baseUrl },
      ),
    );
    const dexHistory = await withMockOkxOnchain((baseUrl) =>
      runCliJson<{
        provider: string;
        address: string;
        chain: string;
        cursor: string;
        transactions: Array<{ type: string; tokenSymbol: string }>;
      }>(
        [
          "portfolio",
          "okx",
          "dex-history",
          "0xabc",
          "ethereum",
          "1700000000000",
          "1710000000000",
          "--type",
          "buy,sell",
          "--json",
        ],
        { WOOO_OKX_ONCHAIN_BASE_URL: baseUrl },
      ),
    );

    expect(chains.provider).toBe("okx-onchain");
    expect(chains.chains[0]?.chainIndex).toBe("1");
    expect(chains.chains[0]?.name).toBe("Ethereum");

    expect(overview.provider).toBe("okx-onchain");
    expect(overview.chain).toBe("1");
    expect(overview.window).toBe("7d");
    expect(overview.timeFrame).toBe("3");
    expect(overview.overview.realizedPnlUsd).toBe("1500.00");
    expect(overview.overview.topPnlTokenList[0]?.tokenSymbol).toBe("WETH");
    expect(overview.overview.preferredMarketCap).toBe("Large");

    expect(recentPnl.provider).toBe("okx-onchain");
    expect(recentPnl.chain).toBe("1");
    expect(recentPnl.cursor).toBe("portfolio-cursor");
    expect(recentPnl.recentPnl[0]?.tokenSymbol).toBe("WETH");
    expect(recentPnl.recentPnl[0]?.totalPnlUsd).toBe("300.00");

    expect(latestPnl.provider).toBe("okx-onchain");
    expect(latestPnl.chain).toBe("1");
    expect(latestPnl.token).toBe("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
    expect(latestPnl.pnl.totalPnlUsd).toBe("1371.68");
    expect(latestPnl.pnl.isPnlSupported).toBe(true);

    expect(dexHistory.provider).toBe("okx-onchain");
    expect(dexHistory.address).toBe("0xabc");
    expect(dexHistory.chain).toBe("1");
    expect(dexHistory.cursor).toBe("dex-history-cursor");
    expect(dexHistory.transactions[0]?.type).toBe("1");
    expect(dexHistory.transactions[0]?.tokenSymbol).toBe("WETH");
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
