import { describe, expect, test } from "bun:test";
import type { HttpSignerMetadata } from "../../src/core/signer-protocol";
import { HttpSignerHarness } from "../fixtures/http-signer-harness";
import { EthereumAnvilHarness, PolygonAnvilHarness } from "./anvil-harness";

const AUTH_ENV = "WOOO_SIGNER_AUTH_TOKEN";
const AUTH_TOKEN = "anvil-remote-signer-token";

interface WalletDiscoverOutput extends HttpSignerMetadata {
  authEnv?: string;
  signerUrl: string;
}

interface WalletConnectOutput {
  address: string;
  chainFamily: string;
  name: string;
  operations: string[];
  signerUrl: string;
}

interface WalletListOutputRow {
  active: boolean;
  address: string;
  chain: string;
  name: string;
  source: string;
}

interface UniswapSwapOutput {
  amountIn: string;
  amountOut: string;
  status: string;
  tokenIn: string;
  tokenOut: string;
  txHash: string;
}

interface ApprovalSetOutput {
  chain: string;
  results: Array<{
    contract: string;
    txHash: string;
    type: "erc20" | "erc1155";
  }>;
}

describe("remote signer anvil e2e", () => {
  test(
    "connects a remote signer and executes a Uniswap swap on an Ethereum fork",
    async () => {
      const anvil = new EthereumAnvilHarness();
      await anvil.start();
      const signer = new HttpSignerHarness({
        privateKey: anvil.privateKey as `0x${string}`,
        address: anvil.address,
        authToken: AUTH_TOKEN,
        rpcUrl: anvil.rpcUrl,
      });
      await signer.start();

      try {
        const env = {
          [AUTH_ENV]: AUTH_TOKEN,
        };
        const discover = await anvil.runJson<WalletDiscoverOutput>(
          [
            "wallet",
            "discover",
            "--signer",
            signer.url,
            "--auth-env",
            AUTH_ENV,
          ],
          { env },
        );
        expect(discover.kind).toBe("wooo-wallet-transport");
        expect(discover.transport).toBe("http-signer");
        expect(discover.authEnv).toBe(AUTH_ENV);
        expect(discover.accounts).toEqual([
          {
            address: anvil.address,
            chainFamily: "evm",
            operations: [
              "sign-typed-data",
              "sign-and-send-transaction",
              "sign-protocol-payload",
            ],
          },
        ]);

        const connect = await anvil.runJson<WalletConnectOutput>(
          [
            "wallet",
            "connect",
            "remote-anvil",
            "--signer",
            signer.url,
            "--auth-env",
            AUTH_ENV,
          ],
          { env },
        );
        expect(connect).toEqual({
          name: "remote-anvil",
          address: anvil.address,
          chainFamily: "evm",
          operations: [
            "sign-typed-data",
            "sign-and-send-transaction",
            "sign-protocol-payload",
          ],
          signerUrl: `${signer.url.replace(/\/$/, "")}/`,
        });

        await anvil.runCli(["wallet", "switch", "remote-anvil"], { env });

        const wallets = await anvil.runJson<WalletListOutputRow[]>(
          ["wallet", "list"],
          { env },
        );
        expect(wallets.some((wallet) => wallet.name === "remote-anvil")).toBe(
          true,
        );
        expect(
          wallets.some(
            (wallet) =>
              wallet.name === "remote-anvil" &&
              wallet.source === "remote" &&
              wallet.active === true,
          ),
        ).toBe(true);

        const swap = await anvil.runJson<UniswapSwapOutput>(
          [
            "dex",
            "uniswap",
            "swap",
            "ETH",
            "USDC",
            "0.1",
            "--chain",
            "ethereum",
            "--yes",
          ],
          { env },
        );
        expect(swap.tokenIn).toBe("ETH");
        expect(swap.tokenOut).toBe("USDC");
        expect(swap.status).toBe("confirmed");
        expect(swap.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);

        const signerOperations = signer.requests.map(
          (request) => request.operation,
        );
        expect(
          signerOperations.filter(
            (operation) => operation === "sign-and-send-transaction",
          ).length,
        ).toBeGreaterThanOrEqual(3);
      } finally {
        await signer.stop();
        await anvil.stop();
      }
    },
    { timeout: 180_000 },
  );

  test(
    "connects a remote signer and sets Polymarket approvals on a Polygon fork",
    async () => {
      const anvil = new PolygonAnvilHarness();
      await anvil.start();
      const signer = new HttpSignerHarness({
        privateKey: anvil.privateKey as `0x${string}`,
        address: anvil.address,
        authToken: AUTH_TOKEN,
        rpcUrl: anvil.rpcUrl,
      });
      await signer.start();

      try {
        const env = {
          [AUTH_ENV]: AUTH_TOKEN,
        };
        await anvil.runJson<WalletConnectOutput>(
          [
            "wallet",
            "connect",
            "remote-polygon-anvil",
            "--signer",
            signer.url,
            "--auth-env",
            AUTH_ENV,
          ],
          { env },
        );
        await anvil.runCli(["wallet", "switch", "remote-polygon-anvil"], {
          env,
        });

        const approvalSet = await anvil.runJson<ApprovalSetOutput>(
          ["prediction", "polymarket", "approve", "set", "--yes"],
          { env },
        );
        expect(approvalSet.chain).toBe("polygon");
        expect(approvalSet.results.length).toBeGreaterThanOrEqual(4);
        expect(
          approvalSet.results.every(
            (result) =>
              result.contract.length > 0 &&
              /^0x[0-9a-fA-F]{64}$/.test(result.txHash),
          ),
        ).toBe(true);

        const signerOperations = signer.requests.map(
          (request) => request.operation,
        );
        expect(
          signerOperations.every(
            (operation) => operation === "sign-and-send-transaction",
          ),
        ).toBe(true);
        expect(signerOperations.length).toBeGreaterThanOrEqual(4);
      } finally {
        await signer.stop();
        await anvil.stop();
      }
    },
    { timeout: 180_000 },
  );
});
