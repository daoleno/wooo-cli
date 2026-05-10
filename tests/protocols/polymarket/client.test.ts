import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { WalletPort } from "../../../src/core/signers";
import {
  getPolymarketDepositWalletAddress,
  PolymarketBridgeClient,
  PolymarketRelayerClient,
  resolvePolymarketAccountBindingFromSigner,
  resolvePolymarketDeploymentOwner,
} from "../../../src/protocols/polymarket/client";

const originalFetch = globalThis.fetch;
const originalEnv = {
  RELAYER_API_KEY: process.env.RELAYER_API_KEY,
  RELAYER_API_KEY_ADDRESS: process.env.RELAYER_API_KEY_ADDRESS,
  WOOO_POLYMARKET_DEPOSIT_WALLET: process.env.WOOO_POLYMARKET_DEPOSIT_WALLET,
  WOOO_POLYMARKET_OWNER: process.env.WOOO_POLYMARKET_OWNER,
  WOOO_POLYMARKET_RELAYER_API_KEY: process.env.WOOO_POLYMARKET_RELAYER_API_KEY,
  WOOO_POLYMARKET_RELAYER_API_KEY_ADDRESS:
    process.env.WOOO_POLYMARKET_RELAYER_API_KEY_ADDRESS,
};
const OWNER = "0x1111111111111111111111111111111111111111";
const AGENT_SIGNER = "0x2222222222222222222222222222222222222222";
const EXPLICIT_DEPOSIT_WALLET = "0x3333333333333333333333333333333333333333";

interface CapturedRequest {
  body: string | null;
  headers: Record<string, string>;
  method: string;
  url: string;
}

beforeEach(() => {
  delete process.env.RELAYER_API_KEY;
  delete process.env.RELAYER_API_KEY_ADDRESS;
  delete process.env.WOOO_POLYMARKET_DEPOSIT_WALLET;
  delete process.env.WOOO_POLYMARKET_OWNER;
  delete process.env.WOOO_POLYMARKET_RELAYER_API_KEY;
  delete process.env.WOOO_POLYMARKET_RELAYER_API_KEY_ADDRESS;
});

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
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
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
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

function createSigner(address: string): WalletPort {
  return {
    accountLabel: "test-signer",
    address,
    async signAndSendTransaction() {
      throw new Error("not implemented");
    },
    async signProtocolPayload() {
      throw new Error("not implemented");
    },
    async signTypedData() {
      throw new Error("not implemented");
    },
  };
}

describe("Polymarket account binding", () => {
  test("defaults to the active signer as owner when no target is configured", () => {
    const signer = createSigner(OWNER);
    const binding = resolvePolymarketAccountBindingFromSigner(signer);

    expect(binding.signerAddress).toBe(OWNER);
    expect(binding.ownerAddress).toBe(OWNER);
    expect(binding.depositWalletAddress).toBe(
      getPolymarketDepositWalletAddress(OWNER),
    );
  });

  test("derives the deposit wallet from WOOO_POLYMARKET_OWNER", () => {
    process.env.WOOO_POLYMARKET_OWNER = OWNER;

    const binding = resolvePolymarketAccountBindingFromSigner(
      createSigner(AGENT_SIGNER),
    );

    expect(binding.signerAddress).toBe(AGENT_SIGNER);
    expect(binding.ownerAddress).toBe(OWNER);
    expect(binding.depositWalletAddress).toBe(
      getPolymarketDepositWalletAddress(OWNER),
    );
  });

  test("rejects a deposit wallet that does not match the configured owner", () => {
    process.env.WOOO_POLYMARKET_OWNER = OWNER;

    expect(() =>
      resolvePolymarketAccountBindingFromSigner(createSigner(AGENT_SIGNER), {
        depositWalletAddress: EXPLICIT_DEPOSIT_WALLET,
      }),
    ).toThrow(/deposit wallet mismatch/i);
  });

  test("uses an explicit deposit wallet without inventing an owner", () => {
    const binding = resolvePolymarketAccountBindingFromSigner(
      createSigner(AGENT_SIGNER),
      {
        depositWalletAddress: EXPLICIT_DEPOSIT_WALLET,
      },
    );

    expect(binding.signerAddress).toBe(AGENT_SIGNER);
    expect(binding.ownerAddress).toBeUndefined();
    expect(binding.depositWalletAddress).toBe(EXPLICIT_DEPOSIT_WALLET);
  });

  test("rejects mismatched deposit wallet sources", () => {
    process.env.WOOO_POLYMARKET_DEPOSIT_WALLET = EXPLICIT_DEPOSIT_WALLET;

    expect(() =>
      resolvePolymarketAccountBindingFromSigner(createSigner(AGENT_SIGNER), {
        depositWalletAddress: getPolymarketDepositWalletAddress(OWNER),
      }),
    ).toThrow(/address mismatch/i);
  });

  test("requires an owner for deployment when the signer does not derive the target wallet", () => {
    const binding = resolvePolymarketAccountBindingFromSigner(
      createSigner(AGENT_SIGNER),
      {
        depositWalletAddress: EXPLICIT_DEPOSIT_WALLET,
      },
    );

    expect(() => resolvePolymarketDeploymentOwner(binding)).toThrow(
      /WOOO_POLYMARKET_OWNER/,
    );
  });

  test("uses the configured owner for deployment", () => {
    process.env.WOOO_POLYMARKET_OWNER = OWNER;
    const binding = resolvePolymarketAccountBindingFromSigner(
      createSigner(AGENT_SIGNER),
    );

    expect(resolvePolymarketDeploymentOwner(binding)).toBe(OWNER);
  });
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
        headers: {
          accept: "application/json",
          "user-agent": "wooo-cli/0.1.1",
        },
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
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "user-agent": "wooo-cli/0.1.1",
        },
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
        headers: {
          accept: "application/json",
          "user-agent": "wooo-cli/0.1.1",
        },
        method: "GET",
        url: "https://bridge.example/status/SoL%20Deposit%20Address",
      },
    ]);
    expect(result.transactions[0]?.status).toBe("COMPLETED");
  });
});

describe("PolymarketRelayerClient", () => {
  test("reads WOOO-prefixed env vars and sends official relayer headers", async () => {
    process.env.WOOO_POLYMARKET_RELAYER_API_KEY = "relayer-key";
    process.env.WOOO_POLYMARKET_RELAYER_API_KEY_ADDRESS = OWNER;
    const requests = installFetchMock(() => ({ nonce: "7" }));

    const client = new PolymarketRelayerClient({
      relayerUrl: "https://relayer.example",
    });
    const result = await client.getNonce(AGENT_SIGNER, "WALLET");

    expect(result.nonce).toBe("7");
    expect(requests).toEqual([
      {
        body: null,
        headers: {
          accept: "application/json",
          relayer_api_key: "relayer-key",
          relayer_api_key_address: OWNER,
          "user-agent": "wooo-cli/0.1.1",
        },
        method: "GET",
        url: `https://relayer.example/nonce?address=${AGENT_SIGNER}&type=WALLET`,
      },
    ]);
  });

  test("does not fall back to unprefixed relayer env vars", async () => {
    process.env.RELAYER_API_KEY = "legacy-key";
    process.env.RELAYER_API_KEY_ADDRESS = OWNER;

    const client = new PolymarketRelayerClient({
      relayerUrl: "https://relayer.example",
    });

    await expect(client.getNonce(AGENT_SIGNER, "WALLET")).rejects.toThrow(
      /WOOO_POLYMARKET_RELAYER_API_KEY/,
    );

    delete process.env.RELAYER_API_KEY;
    delete process.env.RELAYER_API_KEY_ADDRESS;
  });
});
