import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { privateKeyToAccount } from "viem/accounts";
import { signHyperliquidL1Action } from "../../src/core/hyperliquid-signing";
import { createWalletPort, type ResolvedAccount } from "../../src/core/signers";
import { HttpSignerHarness } from "../fixtures/http-signer-harness";

const TEST_PRIVATE_KEY = `0x${"11".repeat(32)}` as const;
const TEST_AUTH_TOKEN = "transport-test-token";

describe("HTTP signer transport integration", () => {
  const originalToken = process.env.WOOO_SIGNER_AUTH_TOKEN;
  let signerHarness: HttpSignerHarness;

  beforeEach(async () => {
    process.env.WOOO_SIGNER_AUTH_TOKEN = TEST_AUTH_TOKEN;
    signerHarness = new HttpSignerHarness({
      privateKey: TEST_PRIVATE_KEY,
      authToken: TEST_AUTH_TOKEN,
      operations: ["sign-typed-data", "sign-protocol-payload"],
    });
    await signerHarness.start();
  });

  afterEach(async () => {
    if (signerHarness) {
      await signerHarness.stop();
    }
    if (originalToken === undefined) {
      delete process.env.WOOO_SIGNER_AUTH_TOKEN;
    } else {
      process.env.WOOO_SIGNER_AUTH_TOKEN = originalToken;
    }
  });

  test("cryptographically signs typed data and protocol payloads over HTTP", async () => {
    const account = privateKeyToAccount(TEST_PRIVATE_KEY);
    const walletPort = createWalletPort({
      custody: "remote",
      label: "transport-test",
      address: account.address,
      authEnv: "WOOO_SIGNER_AUTH_TOKEN",
      chainFamily: "evm",
      chainId: "eip155:1",
      signerUrl: signerHarness.url,
    } satisfies ResolvedAccount);

    const typedDataRequest = {
      domain: {
        name: "TransportTest",
        version: "1",
        chainId: 1,
      },
      types: {
        TransportTest: [{ name: "wallet", type: "address" }],
      },
      primaryType: "TransportTest",
      message: {
        wallet: account.address,
      },
    } as const;

    const expectedTypedSignature = await account.signTypedData({
      domain: typedDataRequest.domain,
      types: typedDataRequest.types,
      primaryType: typedDataRequest.primaryType,
      message: typedDataRequest.message,
    });
    const typedSignature = await walletPort.signTypedData(
      "eip155:1",
      typedDataRequest,
    );
    expect(typedSignature).toBe(expectedTypedSignature);

    const protocolPayloadRequest = {
      action: {
        type: "order",
        orders: [
          {
            a: 0,
            b: true,
            p: "100000",
            s: "0.001",
            r: false,
            t: {
              limit: {
                tif: "Gtc",
              },
            },
          },
        ],
        grouping: "na",
      },
      nonce: 1_700_000_000_000,
      vaultAddress: `0x${"22".repeat(20)}`,
      expiresAfter: 1_700_000_005_000,
      sandbox: true,
      context: {
        actionType: "order",
        symbol: "BTC",
      },
    } as const;

    const expectedProtocolSignature = signHyperliquidL1Action(
      TEST_PRIVATE_KEY,
      protocolPayloadRequest,
    );
    const protocolSignature = await walletPort.signProtocolPayload({
      protocol: "hyperliquid",
      payload: protocolPayloadRequest,
    });
    expect(protocolSignature).toEqual({
      protocol: "hyperliquid",
      signature: expectedProtocolSignature,
    });

    expect(signerHarness.requests.map((request) => request.operation)).toEqual([
      "sign-typed-data",
      "sign-protocol-payload",
    ]);
  });
});
