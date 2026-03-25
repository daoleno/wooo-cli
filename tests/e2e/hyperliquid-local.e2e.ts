import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { CliHarness } from "../fixtures/cli-harness";
import { HttpSignerHarness } from "../fixtures/http-signer-harness";
import { HyperliquidHarness } from "../fixtures/hyperliquid-harness";

const AUTH_ENV = "WOOO_SIGNER_AUTH_HYPERLIQUID_TEST";
const AUTH_TOKEN = "hyperliquid-local-test-token";
const PRIVATE_KEY = `0x${"11".repeat(32)}` as const;

interface HyperliquidFundingOutput {
  annualized: string;
  fundingRate: string;
  symbol: string;
}

interface HyperliquidOrderOutput {
  orderId: string;
  price: number;
  side: string;
  size: number;
  status: string;
  symbol: string;
}

describe("hyperliquid local e2e", () => {
  let cli: CliHarness;
  let signer: HttpSignerHarness;
  let hyperliquid: HyperliquidHarness;

  beforeEach(async () => {
    cli = new CliHarness("wooo-hyperliquid-local-");
    signer = new HttpSignerHarness({
      authToken: AUTH_TOKEN,
      operations: ["sign-protocol-payload"],
      privateKey: PRIVATE_KEY,
    });
    hyperliquid = new HyperliquidHarness();

    await Promise.all([signer.start(), hyperliquid.start()]);
  });

  afterEach(async () => {
    await Promise.all([signer.stop(), hyperliquid.stop()]);
    cli.cleanup();
  });

  test(
    "executes Hyperliquid funding and long commands through a remote signer",
    async () => {
      const env = {
        [AUTH_ENV]: AUTH_TOKEN,
        WOOO_INTERNAL_HYPERLIQUID_API_URL: hyperliquid.url,
      };

      await cli.runCli(
        [
          "wallet",
          "connect",
          "remote-hyperliquid",
          "--signer",
          signer.url,
          "--auth-env",
          AUTH_ENV,
          "--json",
        ],
        { env },
      );
      await cli.runCli(["wallet", "switch", "remote-hyperliquid"], { env });

      const funding = await cli.runJson<HyperliquidFundingOutput>(
        ["perps", "hyperliquid", "funding", "BTC", "--json"],
        { env },
      );
      expect(funding).toEqual({
        symbol: "BTC/USDC:USDC",
        fundingRate: "0.0100%",
        annualized: "10.95%",
      });

      const result = await cli.runJson<HyperliquidOrderOutput>(
        [
          "perps",
          "hyperliquid",
          "long",
          "BTC",
          "100",
          "--leverage",
          "5",
          "--yes",
          "--json",
        ],
        { env },
      );

      expect(result.orderId).toBe("777");
      expect(result.symbol).toBe("BTC/USDC:USDC");
      expect(result.side).toBe("buy");
      expect(result.price).toBe(100000);
      expect(result.status).toBe("closed");
      expect(result.size).toBeGreaterThan(0);

      const signerPayloads = signer.requests
        .filter((request) => request.operation === "sign-protocol-payload")
        .map((request) => request.payload.payload);
      expect(signerPayloads).toHaveLength(2);
      expect(signerPayloads[0]?.context).toEqual({
        actionType: "updateLeverage",
        leverage: 5,
        symbol: "BTC/USDC:USDC",
      });
      expect(signerPayloads[1]?.context).toEqual({
        actionType: "order",
        side: "buy",
        sizeUsd: 100,
        symbol: "BTC/USDC:USDC",
      });

      const exchangeActions = hyperliquid.exchangeRequests.map(
        (request) => request.body.action as Record<string, unknown>,
      );
      expect(exchangeActions).toHaveLength(2);
      expect(exchangeActions[0]).toEqual({
        type: "updateLeverage",
        asset: 0,
        isCross: true,
        leverage: 5,
      });
      expect(exchangeActions[1]?.type).toBe("order");
      expect(Array.isArray(exchangeActions[1]?.orders)).toBe(true);

      const infoRequestTypes = hyperliquid.infoRequests.map(
        (request) => request.body.type,
      );
      expect(infoRequestTypes).toContain("metaAndAssetCtxs");
    },
    { timeout: 30_000 },
  );
});
