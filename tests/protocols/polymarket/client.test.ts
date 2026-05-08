import { afterEach, describe, expect, mock, test } from "bun:test";
import { PolymarketBridgeClient } from "../../../src/protocols/polymarket/client";

const originalFetch = globalThis.fetch;

interface CapturedRequest {
  body: string | null;
  method: string;
  url: string;
}

function installFetchMock(handler: (request: CapturedRequest) => unknown) {
  const requests: CapturedRequest[] = [];
  const fetchMock = mock(
    async (...args: Parameters<typeof fetch>): Promise<Response> => {
      const [input, init] = args;
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const request = {
        body: typeof init?.body === "string" ? init.body : null,
        method: init?.method ?? "GET",
        url,
      };
      requests.push(request);
      return Response.json(handler(request));
    },
  ) as unknown as typeof fetch;

  globalThis.fetch = fetchMock;
  return requests;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("PolymarketBridgeClient", () => {
  test("fetches supported assets from the bridge host", async () => {
    const requests = installFetchMock(() => ({
      supportedAssets: [
        {
          chainId: "8453",
          chainName: "Base",
          minCheckoutUsd: 5,
          token: {
            address: "0xbase-usdc",
            decimals: 6,
            name: "USD Coin",
            symbol: "USDC",
          },
        },
      ],
    }));

    const client = new PolymarketBridgeClient({
      bridgeHost: "https://bridge.example",
    });
    const result = await client.getSupportedAssets();

    expect(requests).toEqual([
      {
        body: null,
        method: "GET",
        url: "https://bridge.example/supported-assets",
      },
    ]);
    expect(result.supportedAssets[0]?.chainName).toBe("Base");
  });

  test("creates deposit addresses for a deposit wallet", async () => {
    const depositWallet = "0x1111111111111111111111111111111111111111";
    const requests = installFetchMock(() => ({
      address: {
        btc: "bc1qdeposit",
        evm: "0x2222222222222222222222222222222222222222",
        svm: "SoLDepositAddress",
      },
      note: "Only send supported assets.",
    }));

    const client = new PolymarketBridgeClient({
      bridgeHost: "https://bridge.example",
    });
    const result = await client.createDepositAddresses(depositWallet);

    expect(requests).toEqual([
      {
        body: JSON.stringify({ address: depositWallet }),
        method: "POST",
        url: "https://bridge.example/deposit",
      },
    ]);
    expect(result.address.evm).toBe(
      "0x2222222222222222222222222222222222222222",
    );
  });

  test("checks deposit status for an official deposit address", async () => {
    const requests = installFetchMock(() => ({
      transactions: [{ status: "COMPLETED", txHash: "0xabc" }],
    }));

    const client = new PolymarketBridgeClient({
      bridgeHost: "https://bridge.example",
    });
    const result = await client.getStatus("SoL Deposit Address");

    expect(requests).toEqual([
      {
        body: null,
        method: "GET",
        url: "https://bridge.example/status/SoL%20Deposit%20Address",
      },
    ]);
    expect(result.transactions[0]?.status).toBe("COMPLETED");
  });
});
