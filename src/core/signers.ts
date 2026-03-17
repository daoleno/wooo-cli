import { spawn } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Address, Hash } from "viem";
import type {
  EvmApprovalRequest,
  EvmContractWriteRequest,
  HyperliquidActionSignature,
  HyperliquidActionSigningRequest,
  SignerCommandRequest,
  SignerCommandResponse,
  SignerPrompt,
  SignerRequestOrigin,
  SignerServiceMetadata,
} from "./signer-protocol";
import {
  deserializeSignerPayload,
  serializeSignerPayload,
} from "./signer-protocol";
import type { WalletRecord } from "./wallet-store";

export interface EvmSigner {
  address: Address;
  signHyperliquidL1Action(
    request: HyperliquidActionSigningRequest,
    origin?: SignerRequestOrigin,
  ): Promise<HyperliquidActionSignature>;
  writeContract(
    chainName: string,
    request: EvmContractWriteRequest,
    options?: {
      approval?: EvmApprovalRequest;
      origin?: SignerRequestOrigin;
      prompt?: SignerPrompt;
    },
  ): Promise<Hash>;
}

export interface SolanaSigner {
  address: string;
  sendVersionedTransaction(
    network: string,
    serializedTransactionBase64: string,
    options?: {
      origin?: SignerRequestOrigin;
      prompt?: SignerPrompt;
    },
  ): Promise<string>;
}

interface CommandInvocationPaths {
  dir: string;
  requestFile: string;
  responseFile: string;
}

const SAFE_SIGNER_ENV_KEYS = [
  "BUN_INSTALL",
  "COLORTERM",
  "FORCE_COLOR",
  "HOME",
  "LANG",
  "LC_ALL",
  "LOGNAME",
  "NO_COLOR",
  "PATH",
  "SHELL",
  "TEMP",
  "TERM",
  "TMP",
  "TMPDIR",
  "USER",
] as const;
const LOCAL_SIGNER_SERVICE_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const SUPPORTED_SIGNER_REQUEST_KINDS = new Set<SignerCommandRequest["kind"]>([
  "evm-write-contract",
  "hyperliquid-sign-l1-action",
  "solana-send-versioned-transaction",
]);

function getBuiltInSignerCommand(): string[] {
  const scriptPath = process.argv[1];
  if (!scriptPath) {
    throw new Error("Unable to determine current CLI entrypoint");
  }

  return [process.execPath, scriptPath, "wallet", "__local-wallet-bridge"];
}

function getSignerCommand(wallet: WalletRecord): string[] {
  if (
    wallet.connection.mode === "remote" &&
    wallet.connection.transport === "command"
  ) {
    return wallet.connection.command;
  }
  return getBuiltInSignerCommand();
}

export function normalizeSignerServiceUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid signer service URL: ${message}`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(
      `Unsupported signer service protocol: ${url.protocol}. Use http:// or https:// for a local service.`,
    );
  }

  if (!LOCAL_SIGNER_SERVICE_HOSTS.has(url.hostname)) {
    throw new Error(
      `Signer service URL must point to a local host. Received host "${url.hostname}".`,
    );
  }

  return url.toString();
}

function isSignerServiceMetadata(
  value: unknown,
): value is SignerServiceMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const metadata = value as {
    kind?: unknown;
    supportedKinds?: unknown;
    version?: unknown;
    wallets?: unknown;
  };

  return (
    metadata.version === 1 &&
    metadata.kind === "wooo-signer-service" &&
    Array.isArray(metadata.supportedKinds) &&
    metadata.supportedKinds.every(
      (item) =>
        typeof item === "string" &&
        SUPPORTED_SIGNER_REQUEST_KINDS.has(
          item as SignerCommandRequest["kind"],
        ),
    ) &&
    Array.isArray(metadata.wallets) &&
    metadata.wallets.every(
      (wallet) =>
        wallet &&
        typeof wallet === "object" &&
        !Array.isArray(wallet) &&
        "address" in wallet &&
        typeof wallet.address === "string" &&
        "chain" in wallet &&
        (wallet.chain === "evm" || wallet.chain === "solana"),
    )
  );
}

export async function fetchSignerServiceMetadata(
  rawUrl: string,
): Promise<SignerServiceMetadata> {
  const url = normalizeSignerServiceUrl(rawUrl);
  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json",
    },
  });

  const payload = await response.text();
  if (!response.ok) {
    throw new Error(
      `Signer service metadata request failed with HTTP ${response.status}: ${payload || "<empty>"}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Signer service returned invalid JSON metadata: ${message}`,
    );
  }

  if (!isSignerServiceMetadata(parsed)) {
    throw new Error("Signer service returned an invalid metadata payload");
  }

  if (parsed.wallets.length === 0) {
    throw new Error("Signer service did not advertise any wallets");
  }

  return parsed;
}

export function createSignerChildEnv(
  wallet: WalletRecord,
): Record<string, string> {
  const env: Record<string, string> = {};

  for (const key of SAFE_SIGNER_ENV_KEYS) {
    const value = process.env[key];
    if (value) {
      env[key] = value;
    }
  }

  if (process.env.WOOO_CONFIG_DIR) {
    env.WOOO_CONFIG_DIR = process.env.WOOO_CONFIG_DIR;
  }

  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("WOOO_SIGNER_") && value) {
      env[key] = value;
    }
  }

  if (wallet.connection.mode === "local" && process.env.WOOO_MASTER_PASSWORD) {
    env.WOOO_MASTER_PASSWORD = process.env.WOOO_MASTER_PASSWORD;
  }

  return env;
}

function createInvocationPaths(
  request: SignerCommandRequest,
): CommandInvocationPaths {
  const dir = mkdtempSync(join(tmpdir(), "wooo-signer-"));
  const requestFile = join(dir, "request.json");
  const responseFile = join(dir, "response.json");
  writeFileSync(requestFile, serializeSignerPayload(request));
  return { dir, requestFile, responseFile };
}

function readSignerResponse(
  paths: CommandInvocationPaths,
): SignerCommandResponse {
  if (!existsSync(paths.responseFile)) {
    throw new Error("Signer did not produce a response");
  }
  const payload = readFileSync(paths.responseFile, "utf-8");
  return deserializeSignerPayload<SignerCommandResponse>(payload);
}

function cleanupInvocationPaths(paths: CommandInvocationPaths): void {
  rmSync(paths.dir, { recursive: true, force: true });
}

async function invokeSignerService(
  wallet: WalletRecord,
  request: SignerCommandRequest,
): Promise<SignerCommandResponse> {
  if (
    wallet.connection.mode !== "remote" ||
    wallet.connection.transport !== "service"
  ) {
    throw new Error("Wallet is not configured for service-based signing");
  }

  const response = await fetch(wallet.connection.url, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: serializeSignerPayload(request),
  });

  const payload = await response.text();
  if (!payload.trim()) {
    throw new Error(
      `Signer service at ${wallet.connection.url} returned an empty response`,
    );
  }

  const parsed = deserializeSignerPayload<SignerCommandResponse>(payload);
  if (!response.ok) {
    if (!parsed.ok) {
      throw new Error(parsed.error);
    }
    throw new Error(
      `Signer service at ${wallet.connection.url} returned HTTP ${response.status}`,
    );
  }

  return parsed;
}

async function invokeSignerCommand(
  wallet: WalletRecord,
  request: SignerCommandRequest,
): Promise<SignerCommandResponse> {
  if (
    wallet.connection.mode === "remote" &&
    wallet.connection.transport === "service"
  ) {
    return await invokeSignerService(wallet, request);
  }

  const paths = createInvocationPaths(request);
  const command = [
    ...getSignerCommand(wallet),
    "--request-file",
    paths.requestFile,
    "--response-file",
    paths.responseFile,
  ];

  try {
    const child = spawn(command[0], command.slice(1), {
      env: createSignerChildEnv(wallet),
      stdio: "inherit",
    });

    const exitCode = await new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => resolve(code ?? 1));
    });

    const response = readSignerResponse(paths);
    if (exitCode !== 0) {
      if (!response.ok) {
        throw new Error(response.error);
      }
      throw new Error(`Signer exited with code ${exitCode}`);
    }

    return response;
  } finally {
    cleanupInvocationPaths(paths);
  }
}

function toWalletContext(wallet: WalletRecord) {
  return {
    name: wallet.name,
    address: wallet.address,
    chain: wallet.chain,
    mode: wallet.connection.mode,
  } as const;
}

export function createEvmSigner(wallet: WalletRecord): EvmSigner {
  return {
    address: wallet.address as Address,
    async writeContract(chainName, request, options) {
      const response = await invokeSignerCommand(wallet, {
        version: 1,
        kind: "evm-write-contract",
        wallet: toWalletContext(wallet),
        origin: options?.origin,
        chainName,
        contract: request,
        approval: options?.approval,
        prompt: options?.prompt,
      });

      if (!response.ok || !("txHash" in response)) {
        throw new Error(
          response.ok ? "Signer did not return tx hash" : response.error,
        );
      }
      return response.txHash as Hash;
    },
    async signHyperliquidL1Action(request, origin) {
      const response = await invokeSignerCommand(wallet, {
        version: 1,
        kind: "hyperliquid-sign-l1-action",
        wallet: toWalletContext(wallet),
        origin,
        request,
      });

      if (!response.ok || !("signature" in response)) {
        throw new Error(
          response.ok
            ? "Signer did not return Hyperliquid signature"
            : response.error,
        );
      }
      return response.signature;
    },
  };
}

export function createSolanaSigner(wallet: WalletRecord): SolanaSigner {
  return {
    address: wallet.address,
    async sendVersionedTransaction(
      network,
      serializedTransactionBase64,
      options,
    ) {
      const response = await invokeSignerCommand(wallet, {
        version: 1,
        kind: "solana-send-versioned-transaction",
        wallet: toWalletContext(wallet),
        origin: options?.origin,
        network,
        serializedTransactionBase64,
        prompt: options?.prompt,
      });

      if (!response.ok || !("txHash" in response)) {
        throw new Error(
          response.ok ? "Signer did not return tx hash" : response.error,
        );
      }
      return String(response.txHash);
    },
  };
}
