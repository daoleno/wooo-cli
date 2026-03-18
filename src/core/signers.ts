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
  EvmTypedDataSignRequest,
  HttpSignerMetadata,
  HttpSignerMetadataKind,
  HyperliquidActionSignature,
  HyperliquidActionSigningRequest,
  SignerBrokerMetadata,
  SignerCommandRequest,
  SignerCommandResponse,
  SignerCommandTerminalResponse,
  SignerPrompt,
  SignerRequestOrigin,
  SignerServiceMetadata,
} from "./signer-protocol";
import {
  deserializeSignerPayload,
  isSignerCommandPendingResponse,
  isSignerCommandResponse,
  serializeSignerPayload,
} from "./signer-protocol";
import type { WalletRecord } from "./wallet-store";

export interface EvmSigner {
  address: Address;
  signTypedData(
    chainName: string,
    request: EvmTypedDataSignRequest,
    options?: {
      origin?: SignerRequestOrigin;
      prompt?: SignerPrompt;
    },
  ): Promise<`0x${string}`>;
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
  "evm-sign-typed-data",
  "evm-write-contract",
  "hyperliquid-sign-l1-action",
  "solana-send-versioned-transaction",
]);
const DEFAULT_HTTP_SIGNER_POLL_INTERVAL_MS = 1_000;
const DEFAULT_HTTP_SIGNER_TIMEOUT_MS = 5 * 60 * 1_000;

function getBuiltInSignerCommand(): string[] {
  const scriptPath = process.argv[1];
  if (!scriptPath) {
    throw new Error("Unable to determine current CLI entrypoint");
  }

  return [process.execPath, scriptPath, "wallet", "__local-wallet-bridge"];
}

function getSignerCommand(wallet: WalletRecord): string[] {
  if (
    wallet.connection.mode === "external" &&
    wallet.connection.transport === "command"
  ) {
    return wallet.connection.command;
  }
  return getBuiltInSignerCommand();
}

function normalizeHttpSignerUrl(
  rawUrl: string,
  options: {
    allowRemoteHosts: boolean;
    label: string;
  },
): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid ${options.label} URL: ${message}`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(
      `Unsupported ${options.label} protocol: ${url.protocol}. Use http:// or https://.`,
    );
  }

  if (
    !options.allowRemoteHosts &&
    !LOCAL_SIGNER_SERVICE_HOSTS.has(url.hostname)
  ) {
    throw new Error(
      `${options.label} URL must point to a local host. Received host "${url.hostname}".`,
    );
  }

  if (
    options.allowRemoteHosts &&
    url.protocol === "http:" &&
    !LOCAL_SIGNER_SERVICE_HOSTS.has(url.hostname)
  ) {
    throw new Error(
      `${options.label} URL must use https:// unless it points to a local host.`,
    );
  }

  return url.toString();
}

export function normalizeSignerServiceUrl(rawUrl: string): string {
  return normalizeHttpSignerUrl(rawUrl, {
    allowRemoteHosts: false,
    label: "Signer service",
  });
}

export function normalizeSignerBrokerUrl(rawUrl: string): string {
  return normalizeHttpSignerUrl(rawUrl, {
    allowRemoteHosts: true,
    label: "Wallet broker",
  });
}

function isHttpSignerMetadata(
  value: unknown,
  expectedKind: HttpSignerMetadataKind,
): value is HttpSignerMetadata {
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
    metadata.kind === expectedKind &&
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

function resolveBrokerAuthToken(authEnv?: string): string | null {
  if (!authEnv) {
    return null;
  }

  const value = process.env[authEnv];
  if (!value?.trim()) {
    throw new Error(
      `Wallet broker auth env "${authEnv}" is not set or is empty.`,
    );
  }

  return value.trim();
}

function createHttpSignerHeaders(options?: {
  authEnv?: string;
  includeJsonContentType?: boolean;
}): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
  };

  if (options?.includeJsonContentType) {
    headers["content-type"] = "application/json";
  }

  const token = resolveBrokerAuthToken(options?.authEnv);
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  return headers;
}

async function fetchHttpSignerMetadata(
  url: string,
  options: {
    authEnv?: string;
    expectedKind: HttpSignerMetadataKind;
  },
): Promise<HttpSignerMetadata> {
  const response = await fetch(url, {
    method: "GET",
    headers: createHttpSignerHeaders({
      authEnv: options.authEnv,
    }),
  });

  const payload = await response.text();
  if (!response.ok) {
    throw new Error(
      `${options.expectedKind === "wooo-signer-service" ? "Signer service" : "Wallet broker"} metadata request failed with HTTP ${response.status}: ${payload || "<empty>"}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${options.expectedKind === "wooo-signer-service" ? "Signer service" : "Wallet broker"} returned invalid JSON metadata: ${message}`,
    );
  }

  if (!isHttpSignerMetadata(parsed, options.expectedKind)) {
    throw new Error(
      `${options.expectedKind === "wooo-signer-service" ? "Signer service" : "Wallet broker"} returned an invalid metadata payload`,
    );
  }

  if (parsed.wallets.length === 0) {
    throw new Error(
      `${options.expectedKind === "wooo-signer-service" ? "Signer service" : "Wallet broker"} did not advertise any wallets`,
    );
  }

  return parsed;
}

export async function fetchSignerServiceMetadata(
  rawUrl: string,
): Promise<SignerServiceMetadata> {
  const url = normalizeSignerServiceUrl(rawUrl);
  return (await fetchHttpSignerMetadata(url, {
    expectedKind: "wooo-signer-service",
  })) as SignerServiceMetadata;
}

export async function fetchSignerBrokerMetadata(
  rawUrl: string,
  authEnv?: string,
): Promise<SignerBrokerMetadata> {
  const url = normalizeSignerBrokerUrl(rawUrl);
  return (await fetchHttpSignerMetadata(url, {
    expectedKind: "wooo-wallet-broker",
    authEnv,
  })) as SignerBrokerMetadata;
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

function parsePositiveIntegerEnv(envKey: string, fallback: number): number {
  const value = process.env[envKey];
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

function getHttpSignerPollIntervalMs(): number {
  return parsePositiveIntegerEnv(
    "WOOO_HTTP_SIGNER_POLL_INTERVAL_MS",
    DEFAULT_HTTP_SIGNER_POLL_INTERVAL_MS,
  );
}

function getHttpSignerTimeoutMs(): number {
  return parsePositiveIntegerEnv(
    "WOOO_HTTP_SIGNER_TIMEOUT_MS",
    DEFAULT_HTTP_SIGNER_TIMEOUT_MS,
  );
}

function createHttpSignerRequestStatusUrl(
  endpointUrl: string,
  requestId: string,
): string {
  const url = new URL(endpointUrl);
  const basePath = url.pathname.endsWith("/")
    ? url.pathname
    : `${url.pathname}/`;
  url.pathname = `${basePath}requests/${encodeURIComponent(requestId)}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function parseHttpSignerResponse(
  url: string,
  response: Response,
  transportLabel: string,
): Promise<SignerCommandResponse> {
  const payload = await response.text();
  if (!payload.trim()) {
    throw new Error(`${transportLabel} at ${url} returned an empty response`);
  }

  let parsed: unknown;
  try {
    parsed = deserializeSignerPayload<unknown>(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${transportLabel} at ${url} returned invalid JSON: ${message}`,
    );
  }

  if (!isSignerCommandResponse(parsed)) {
    throw new Error(
      `${transportLabel} at ${url} returned an invalid signer response payload`,
    );
  }

  return parsed;
}

function assertTerminalHttpSignerResponse(
  response: SignerCommandResponse,
  transportLabel: string,
): asserts response is SignerCommandTerminalResponse {
  if (!isSignerCommandPendingResponse(response)) {
    return;
  }

  throw new Error(
    `${transportLabel} request ${response.requestId} remained pending without a terminal result`,
  );
}

async function pollHttpSignerResponse(
  endpointUrl: string,
  initialResponse: SignerCommandResponse,
  options?: {
    authEnv?: string;
    transportLabel?: string;
  },
): Promise<SignerCommandTerminalResponse> {
  const transportLabel = options?.transportLabel ?? "Signer transport";
  if (!isSignerCommandPendingResponse(initialResponse)) {
    assertTerminalHttpSignerResponse(initialResponse, transportLabel);
    return initialResponse;
  }

  const pollIntervalMs = getHttpSignerPollIntervalMs();
  const timeoutMs = getHttpSignerTimeoutMs();
  const deadline = Date.now() + timeoutMs;
  let pendingResponse = initialResponse;

  while (true) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new Error(
        `${transportLabel} request ${pendingResponse.requestId} timed out after ${timeoutMs}ms`,
      );
    }

    const delayMs = Math.min(
      Math.max(pendingResponse.pollAfterMs ?? pollIntervalMs, 0),
      remainingMs,
    );
    if (delayMs > 0) {
      await sleep(delayMs);
    }

    const statusUrl = createHttpSignerRequestStatusUrl(
      endpointUrl,
      pendingResponse.requestId,
    );
    const response = await fetch(statusUrl, {
      method: "GET",
      headers: createHttpSignerHeaders({
        authEnv: options?.authEnv,
      }),
    });
    const parsed = await parseHttpSignerResponse(
      statusUrl,
      response,
      transportLabel,
    );

    if (!response.ok) {
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      throw new Error(
        `${transportLabel} at ${statusUrl} returned HTTP ${response.status}`,
      );
    }

    if (isSignerCommandPendingResponse(parsed)) {
      pendingResponse = parsed;
      continue;
    }

    return parsed;
  }
}

async function invokeHttpSigner(
  wallet: WalletRecord,
  request: SignerCommandRequest,
): Promise<SignerCommandTerminalResponse> {
  if (
    wallet.connection.mode !== "external" ||
    (wallet.connection.transport !== "service" &&
      wallet.connection.transport !== "broker")
  ) {
    throw new Error("Wallet is not configured for HTTP signer transport");
  }

  const transportLabel =
    wallet.connection.transport === "broker"
      ? "Wallet broker"
      : "Signer service";
  const response = await fetch(wallet.connection.url, {
    method: "POST",
    headers: createHttpSignerHeaders({
      authEnv:
        wallet.connection.transport === "broker"
          ? wallet.connection.authEnv
          : undefined,
      includeJsonContentType: true,
    }),
    body: serializeSignerPayload(request),
  });
  const parsed = await parseHttpSignerResponse(
    wallet.connection.url,
    response,
    transportLabel,
  );

  if (!response.ok) {
    if (!parsed.ok) {
      throw new Error(parsed.error);
    }
    throw new Error(
      `${transportLabel} at ${wallet.connection.url} returned HTTP ${response.status}`,
    );
  }

  if (!parsed.ok) {
    throw new Error(parsed.error);
  }

  return await pollHttpSignerResponse(wallet.connection.url, parsed, {
    authEnv:
      wallet.connection.transport === "broker"
        ? wallet.connection.authEnv
        : undefined,
    transportLabel,
  });
}

async function invokeSignerCommand(
  wallet: WalletRecord,
  request: SignerCommandRequest,
): Promise<SignerCommandResponse> {
  if (
    wallet.connection.mode === "external" &&
    (wallet.connection.transport === "service" ||
      wallet.connection.transport === "broker")
  ) {
    return await invokeHttpSigner(wallet, request);
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
    async signTypedData(chainName, request, options) {
      const response = await invokeSignerCommand(wallet, {
        version: 1,
        kind: "evm-sign-typed-data",
        wallet: toWalletContext(wallet),
        origin: options?.origin,
        chainName,
        typedData: request,
        prompt: options?.prompt,
      });

      if (!response.ok || !("signatureHex" in response)) {
        throw new Error(
          response.ok
            ? "Signer did not return typed data signature"
            : response.error,
        );
      }
      return response.signatureHex as `0x${string}`;
    },
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
