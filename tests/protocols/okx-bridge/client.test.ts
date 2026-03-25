import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
  createOkxSignatureHeaders,
  OkxBridgeClient,
} from "../../../src/protocols/okx-bridge/client";

describe("OKX HMAC signing", () => {
  test("createOkxSignatureHeaders produces required headers", () => {
    const headers = createOkxSignatureHeaders({
      method: "GET",
      requestPath: "/api/v5/dex/cross-chain/quote",
      queryString: "fromChainId=1&toChainId=42161",
      apiKey: "test-key",
      secretKey: "test-secret",
      passphrase: "test-pass",
      projectId: "test-project",
    });
    expect(headers["OK-ACCESS-KEY"]).toBe("test-key");
    expect(headers["OK-ACCESS-PASSPHRASE"]).toBe("test-pass");
    expect(headers["OK-ACCESS-PROJECT"]).toBe("test-project");
    expect(headers["OK-ACCESS-SIGN"]).toBeDefined();
    expect(headers["OK-ACCESS-SIGN"].length).toBeGreaterThan(0);
    expect(headers["OK-ACCESS-TIMESTAMP"]).toBeDefined();
    expect(headers["Content-Type"]).toBe("application/json");
  });

  test("signature changes with different inputs", () => {
    const base = {
      method: "GET",
      requestPath: "/api/v5/dex/cross-chain/quote",
      apiKey: "test-key",
      secretKey: "test-secret",
      passphrase: "test-pass",
      projectId: "test-project",
    };
    const h1 = createOkxSignatureHeaders({
      ...base,
      queryString: "fromChainId=1",
    });
    const h2 = createOkxSignatureHeaders({
      ...base,
      queryString: "fromChainId=42161",
    });
    expect(h1["OK-ACCESS-SIGN"]).not.toBe(h2["OK-ACCESS-SIGN"]);
  });
});

describe("OkxBridgeClient", () => {
  const auth = {
    apiKey: "test-key",
    secretKey: "test-secret",
    passphrase: "test-pass",
    projectId: "test-project",
  };

  beforeEach(() => {
    mock.restore();
  });

  test("getQuote maps response to OkxBridgeQuote", async () => {
    const mockResponse = {
      code: "0",
      msg: "",
      data: [
        {
          fromChainId: "1",
          toChainId: "42161",
          fromToken: {
            tokenSymbol: "USDC",
            tokenContractAddress: "0xA0b8",
            decimal: "6",
          },
          toToken: {
            tokenSymbol: "USDC",
            tokenContractAddress: "0xaf88",
            decimal: "6",
          },
          fromTokenAmount: "100000000",
          toTokenAmount: "99800000",
          bridgeName: "across",
          estimatedGas: "200000",
          tx: { to: "0x1234", data: "0x5678", value: "0" },
          needApprove: "false",
        },
      ],
    };

    globalThis.fetch = mock(
      async () => new Response(JSON.stringify(mockResponse), { status: 200 }),
    ) as any;

    const client = new OkxBridgeClient(auth);
    const quote = await client.getQuote({
      fromChainId: "1",
      toChainId: "42161",
      fromTokenAddress: "0xA0b8",
      toTokenAddress: "0xaf88",
      amount: "100000000",
      userWalletAddress: "0xuser",
    });

    expect(quote.fromChainId).toBe("1");
    expect(quote.toChainId).toBe("42161");
    expect(quote.fromToken.symbol).toBe("USDC");
    expect(quote.toAmount).toBe("99800000");
    expect(quote.bridgeName).toBe("across");
    expect(quote.tx.to).toBe("0x1234");
  });

  test("getStatus maps response to OkxBridgeStatus", async () => {
    const mockResponse = {
      code: "0",
      msg: "",
      data: [
        {
          status: "SUCCESS",
          fromChainId: "1",
          toChainId: "42161",
          bridgeName: "across",
          sourceChainGasfee: "0.001",
          destinationChainGasfee: "0.0005",
          crossChainFee: "0.01",
        },
      ],
    };

    globalThis.fetch = mock(
      async () => new Response(JSON.stringify(mockResponse), { status: 200 }),
    ) as any;

    const client = new OkxBridgeClient(auth);
    const status = await client.getStatus("0xabc");

    expect(status.status).toBe("SUCCESS");
    expect(status.fromChainId).toBe("1");
    expect(status.bridgeName).toBe("across");
  });

  test("getSupportedChains returns chain list", async () => {
    const mockResponse = {
      code: "0",
      msg: "",
      data: [
        { chainId: "1", chainName: "Ethereum" },
        { chainId: "42161", chainName: "Arbitrum" },
      ],
    };

    globalThis.fetch = mock(
      async () => new Response(JSON.stringify(mockResponse), { status: 200 }),
    ) as any;

    const client = new OkxBridgeClient(auth);
    const chains = await client.getSupportedChains();

    expect(chains.length).toBe(2);
    expect(chains[0].chainId).toBe("1");
    expect(chains[0].chainName).toBe("Ethereum");
  });

  test("resolveToken resolves symbol to address and decimals", async () => {
    const mockResponse = {
      code: "0",
      msg: "",
      data: [
        {
          tokenSymbol: "USDC",
          tokenContractAddress: "0xA0b8",
          decimal: "6",
          chainId: "1",
        },
      ],
    };

    globalThis.fetch = mock(
      async () => new Response(JSON.stringify(mockResponse), { status: 200 }),
    ) as any;

    const client = new OkxBridgeClient(auth);
    const token = await client.resolveToken("ethereum", "1", "USDC");
    expect(token.address).toBe("0xA0b8");
    expect(token.decimals).toBe(6);
  });

  test("throws on missing credentials", () => {
    const saved = {
      key: process.env.WOOO_OKX_API_KEY,
      secret: process.env.WOOO_OKX_API_SECRET,
      pass: process.env.WOOO_OKX_PASSPHRASE,
      proj: process.env.WOOO_OKX_PROJECT_ID,
    };
    delete process.env.WOOO_OKX_API_KEY;
    delete process.env.WOOO_OKX_API_SECRET;
    delete process.env.WOOO_OKX_PASSPHRASE;
    delete process.env.WOOO_OKX_PROJECT_ID;
    try {
      expect(() => new OkxBridgeClient()).toThrow("WOOO_OKX_API_KEY");
    } finally {
      if (saved.key) process.env.WOOO_OKX_API_KEY = saved.key;
      if (saved.secret) process.env.WOOO_OKX_API_SECRET = saved.secret;
      if (saved.pass) process.env.WOOO_OKX_PASSPHRASE = saved.pass;
      if (saved.proj) process.env.WOOO_OKX_PROJECT_ID = saved.proj;
    }
  });

  test("throws on API error", async () => {
    const mockResponse = {
      code: "50001",
      msg: "Invalid params",
      data: [],
    };

    globalThis.fetch = mock(
      async () => new Response(JSON.stringify(mockResponse), { status: 200 }),
    ) as any;

    const client = new OkxBridgeClient(auth);
    await expect(client.getSupportedChains()).rejects.toThrow("Invalid params");
  });
});
