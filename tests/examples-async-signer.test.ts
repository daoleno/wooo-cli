import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Abi } from "viem";
import {
  deserializeSignerPayload,
  type HttpSignerMetadata,
  isSignerCommandPendingResponse,
  type SignerCommandRequest,
  type SignerCommandResponse,
  serializeSignerPayload,
} from "../src/core/signer-protocol";
import {
  createSigner,
  normalizeSignerUrl,
  type ResolvedWallet,
} from "../src/core/signers";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const TEST_TX_HASH = `0x${"ab".repeat(32)}`;
const SIGNER_AUTH_TOKEN = "signer-token-test";

interface ReferenceSignerHarness {
  authToken: string;
  baseUrl: string;
  stop(): Promise<void>;
}

interface DevRequestSummary {
  createdAt: string;
  kind: string;
  requestId: string;
  status: "completed" | "pending";
  wallet: {
    address: string;
    chain: string;
    mode: string;
    name: string;
  };
}

const tempDirs = new Set<string>();
const originalSignerToken = process.env.WOOO_SIGNER_TOKEN;

async function findFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Could not determine a free TCP port"));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(address.port);
      });
    });
  });
}

async function waitForResult<T>(
  producer: () => Promise<T | null>,
  options?: {
    intervalMs?: number;
    timeoutMs?: number;
  },
): Promise<T> {
  const intervalMs = options?.intervalMs ?? 50;
  const timeoutMs = options?.timeoutMs ?? 10_000;
  const startedAt = Date.now();
  let lastError: string | null = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const value = await producer();
      if (value !== null) {
        return value;
      }
      lastError = null;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await Bun.sleep(intervalMs);
  }

  throw new Error(
    lastError
      ? `Timed out while waiting for signer result: ${lastError}`
      : "Timed out while waiting for signer result",
  );
}

async function readJson<T>(response: Response): Promise<T> {
  return JSON.parse(await response.text()) as T;
}

async function startReferenceSigner(): Promise<ReferenceSignerHarness> {
  const port = await findFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const processHandle = Bun.spawn({
    cmd: [
      "bun",
      "run",
      "src/examples/async-signer.ts",
      "--address",
      ZERO_ADDRESS,
      "--chain",
      "ethereum",
      "--port",
      String(port),
    ],
    cwd: process.cwd(),
    env: {
      ...process.env,
      WOOO_SIGNER_TOKEN: SIGNER_AUTH_TOKEN,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdoutPromise = new Response(processHandle.stdout).text();
  const stderrPromise = new Response(processHandle.stderr).text();

  try {
    await waitForResult(async () => {
      const response = await fetch(`${baseUrl}/`, {
        headers: {
          authorization: `Bearer ${SIGNER_AUTH_TOKEN}`,
        },
      }).catch(() => null);
      if (!response?.ok) {
        return null;
      }
      return true;
    });
  } catch (error) {
    processHandle.kill();
    const exitCode = await processHandle.exited;
    const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      [
        `Reference HTTP signer failed to start at ${baseUrl}.`,
        `Reason: ${message}`,
        `Exit code: ${exitCode}`,
        `stderr:\n${stderr || "<empty>"}`,
        `stdout:\n${stdout || "<empty>"}`,
      ].join("\n\n"),
    );
  }

  return {
    authToken: SIGNER_AUTH_TOKEN,
    baseUrl,
    async stop() {
      processHandle.kill();
      await processHandle.exited;
      await Promise.all([stdoutPromise, stderrPromise]);
    },
  };
}

async function runCliJson<T>(
  args: string[],
  options?: {
    env?: Record<string, string>;
  },
): Promise<T> {
  const tempDir = mkdtempSync(join(tmpdir(), "wooo-signer-example-"));
  tempDirs.add(tempDir);

  const proc = Bun.spawn({
    cmd: ["bun", "run", "src/index.ts", ...args, "--json"],
    cwd: process.cwd(),
    env: {
      ...process.env,
      WOOO_CONFIG_DIR: tempDir,
      ...(options?.env ?? {}),
    },
    stderr: "pipe",
    stdout: "pipe",
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

afterEach(() => {
  for (const tempDir of tempDirs) {
    rmSync(tempDir, { recursive: true, force: true });
  }
  tempDirs.clear();

  if (originalSignerToken === undefined) {
    delete process.env.WOOO_SIGNER_TOKEN;
  } else {
    process.env.WOOO_SIGNER_TOKEN = originalSignerToken;
  }
});

describe("reference async signer example", () => {
  test("serves metadata, enforces auth, and resolves pending requests", async () => {
    const signer = await startReferenceSigner();

    try {
      const unauthorized = await fetch(`${signer.baseUrl}/`);
      expect(unauthorized.status).toBe(401);
      expect(
        await readJson<{ error: string; ok: boolean }>(unauthorized),
      ).toEqual({
        error: "Unauthorized",
        ok: false,
      });

      const metadataResponse = await fetch(`${signer.baseUrl}/`, {
        headers: {
          authorization: `Bearer ${signer.authToken}`,
        },
      });
      expect(metadataResponse.status).toBe(200);

      const metadata = await readJson<HttpSignerMetadata>(metadataResponse);
      expect(metadata.kind).toBe("wooo-signer");
      expect(metadata.wallets).toEqual([
        {
          address: ZERO_ADDRESS,
          chain: "evm",
        },
      ]);
      expect(metadata.supportedKinds).toContain("evm-write-contract");

      const request: SignerCommandRequest = {
        version: 1,
        kind: "evm-write-contract",
        wallet: {
          name: "signer-wallet",
          address: ZERO_ADDRESS,
          chain: "evm",
          mode: "external",
        },
        chainName: "ethereum",
        contract: {
          address: ZERO_ADDRESS,
          abi: [] as Abi,
          functionName: "approve",
          args: [],
        },
      };

      const createResponse = await fetch(`${signer.baseUrl}/`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${signer.authToken}`,
          "content-type": "application/json",
        },
        body: serializeSignerPayload(request),
      });
      expect(createResponse.status).toBe(202);

      const createPayload = deserializeSignerPayload<SignerCommandResponse>(
        await createResponse.text(),
      );
      expect(isSignerCommandPendingResponse(createPayload)).toBe(true);
      if (!isSignerCommandPendingResponse(createPayload)) {
        throw new Error("Expected a pending signer response");
      }

      const pendingRequestId = createPayload.requestId;
      const pendingListResponse = await fetch(
        `${signer.baseUrl}/dev/requests`,
        {
          headers: {
            authorization: `Bearer ${signer.authToken}`,
          },
        },
      );
      expect(pendingListResponse.status).toBe(200);
      const pendingList =
        await readJson<DevRequestSummary[]>(pendingListResponse);
      expect(pendingList).toHaveLength(1);
      expect(pendingList[0]).toMatchObject({
        requestId: pendingRequestId,
        kind: "evm-write-contract",
        wallet: {
          name: "signer-wallet",
          address: ZERO_ADDRESS,
          chain: "evm",
          mode: "external",
        },
        status: "pending",
      });
      expect(pendingList[0]?.createdAt).toBeString();

      const pendingStatusResponse = await fetch(
        `${signer.baseUrl}/requests/${pendingRequestId}`,
        {
          headers: {
            authorization: `Bearer ${signer.authToken}`,
          },
        },
      );
      expect(pendingStatusResponse.status).toBe(202);
      const pendingStatus = deserializeSignerPayload<SignerCommandResponse>(
        await pendingStatusResponse.text(),
      );
      expect(isSignerCommandPendingResponse(pendingStatus)).toBe(true);

      const resolveResponse = await fetch(
        `${signer.baseUrl}/dev/requests/${pendingRequestId}/resolve`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${signer.authToken}`,
            "content-type": "application/json",
          },
          body: serializeSignerPayload({
            ok: true,
            txHash: TEST_TX_HASH,
          }),
        },
      );
      expect(resolveResponse.status).toBe(200);
      expect(
        await readJson<{ ok: boolean; resolved: boolean }>(resolveResponse),
      ).toEqual({
        ok: true,
        resolved: true,
      });

      const finalStatusResponse = await fetch(
        `${signer.baseUrl}/requests/${pendingRequestId}`,
        {
          headers: {
            authorization: `Bearer ${signer.authToken}`,
          },
        },
      );
      expect(finalStatusResponse.status).toBe(200);
      expect(
        deserializeSignerPayload<SignerCommandResponse>(
          await finalStatusResponse.text(),
        ),
      ).toEqual({
        ok: true,
        txHash: TEST_TX_HASH,
      });
    } finally {
      await signer.stop();
    }
  });

  test("works with wallet discover and wallet connect over HTTP transport", async () => {
    const signer = await startReferenceSigner();

    try {
      const discoverResult = await runCliJson<{
        authEnv: string;
        kind: string;
        signerUrl: string;
        wallets: Array<{ address: string; chain: string }>;
      }>(
        [
          "wallet",
          "discover",
          "--signer",
          signer.baseUrl,
          "--auth-env",
          "WOOO_SIGNER_TOKEN",
        ],
        {
          env: {
            WOOO_SIGNER_TOKEN: signer.authToken,
          },
        },
      );

      expect(discoverResult.kind).toBe("wooo-signer");
      expect(discoverResult.authEnv).toBe("WOOO_SIGNER_TOKEN");
      expect(discoverResult.wallets).toEqual([
        {
          address: ZERO_ADDRESS,
          chain: "evm",
        },
      ]);

      const connectResult = await runCliJson<{
        address: string;
        chain: string;
        name: string;
        signerUrl: string;
      }>(
        [
          "wallet",
          "connect",
          "signer-example",
          "--signer",
          signer.baseUrl,
          "--auth-env",
          "WOOO_SIGNER_TOKEN",
        ],
        {
          env: {
            WOOO_SIGNER_TOKEN: signer.authToken,
          },
        },
      );

      expect(connectResult).toEqual({
        name: "signer-example",
        address: ZERO_ADDRESS,
        chain: "evm",
        signerUrl: `${signer.baseUrl}/`,
      });
    } finally {
      await signer.stop();
    }
  });

  test("completes an async signer request through the reference signer", async () => {
    const transport = await startReferenceSigner();
    process.env.WOOO_SIGNER_TOKEN = transport.authToken;

    try {
      const wallet: ResolvedWallet = {
        source: "external",
        name: "signer-wallet",
        address: ZERO_ADDRESS,
        chainId: "eip155:1",
        signerUrl: normalizeSignerUrl(transport.baseUrl),
        authEnv: "WOOO_SIGNER_TOKEN",
      };

      const walletSigner = createSigner(wallet);
      const writePromise = walletSigner.writeContract("ethereum", {
        address: ZERO_ADDRESS,
        abi: [] as Abi,
        functionName: "approve",
        args: [],
      });

      const pendingRequest = await waitForResult(async () => {
        const response = await fetch(`${transport.baseUrl}/dev/requests`, {
          headers: {
            authorization: `Bearer ${transport.authToken}`,
          },
        });
        if (!response.ok) {
          throw new Error(
            `Signer request list returned HTTP ${response.status}`,
          );
        }

        const requests = await readJson<DevRequestSummary[]>(response);
        return requests[0] ?? null;
      });

      expect(pendingRequest.kind).toBe("evm-write-contract");
      expect(pendingRequest.wallet).toEqual({
        name: "signer-wallet",
        address: ZERO_ADDRESS,
        chain: "evm",
        mode: "external",
      });
      expect(pendingRequest.status).toBe("pending");

      const resolveResponse = await fetch(
        `${transport.baseUrl}/dev/requests/${pendingRequest.requestId}/resolve`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${transport.authToken}`,
            "content-type": "application/json",
          },
          body: serializeSignerPayload({
            ok: true,
            txHash: TEST_TX_HASH,
          }),
        },
      );
      expect(resolveResponse.status).toBe(200);

      await expect(writePromise).resolves.toBe(TEST_TX_HASH);
    } finally {
      await transport.stop();
    }
  });
});
