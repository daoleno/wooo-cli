import { randomUUID } from "node:crypto";
import {
  signAndSend as owsSignAndSend,
  signTypedData as owsSignTypedData,
} from "@open-wallet-standard/core";
import { type Address, type Hash, type Hex, serializeTransaction } from "viem";
import { getChainFamily, getChainName } from "./chain-ids";
import { getPublicClient, getRpcUrlForChain } from "./evm";
import { signHyperliquidL1Action } from "./hyperliquid-signing";
import {
  ensureHexPrefix,
  exportOwsPrivateKey,
  resolveOwsPassphrase,
} from "./ows";
import type {
  ApprovalPrompt,
  EvmTypedDataSignRequest,
  HttpSignerMetadata,
  ProtocolPayloadRequest,
  ProtocolPayloadSignature,
  SignerCommandRequest,
  SignerCommandResponse,
  SignerCommandTerminalResponse,
  TransactionExecutionRequest,
  TransactionIntent,
  WalletOperationContext,
} from "./signer-protocol";
import {
  deserializeSignerPayload,
  isSignerCommandPendingResponse,
  isSignerCommandResponse,
  serializeSignerPayload,
} from "./signer-protocol";

// ---------------------------------------------------------------------------
// ResolvedAccount type
// ---------------------------------------------------------------------------

export type ResolvedAccount =
  | {
      address: string;
      chainFamily: "evm" | "solana";
      chainId: string;
      custody: "local";
      label: string;
      walletId: string;
      vaultPath: string;
    }
  | {
      address: string;
      authEnv?: string;
      chainFamily: "evm" | "solana";
      chainId: string;
      custody: "remote";
      label: string;
      signerUrl: string;
    };

// ---------------------------------------------------------------------------
// WalletPort interface
// ---------------------------------------------------------------------------

export interface WalletPort {
  accountLabel: string;
  address: string;

  signTypedData(
    chainId: string,
    request: EvmTypedDataSignRequest,
    context?: WalletOperationContext,
    prompt?: ApprovalPrompt,
  ): Promise<Hex>;

  signAndSendTransaction(
    chainId: string,
    request: TransactionExecutionRequest,
    context?: WalletOperationContext,
    prompt?: ApprovalPrompt,
    intent?: TransactionIntent,
  ): Promise<Hash | string>;

  signProtocolPayload(
    request: ProtocolPayloadRequest,
    context?: WalletOperationContext,
  ): Promise<ProtocolPayloadSignature>;
}

// ---------------------------------------------------------------------------
// Bigint JSON replacer (for OWS typed data serialization)
// ---------------------------------------------------------------------------

function bigintReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }
  return value;
}

const EIP712_DOMAIN_FIELD_TYPES: Record<string, string> = {
  chainId: "uint256",
  name: "string",
  salt: "bytes32",
  verifyingContract: "address",
  version: "string",
};

function createEip712DomainFields(
  domain: Record<string, unknown>,
): Array<{ name: string; type: string }> {
  const fields: Array<{ name: string; type: string }> = [];

  for (const key of Object.keys(domain)) {
    const fieldType = EIP712_DOMAIN_FIELD_TYPES[key];
    if (!fieldType) {
      throw new Error(
        `Unsupported EIP-712 domain field "${key}". Provide types.EIP712Domain explicitly if you need a custom domain.`,
      );
    }
    fields.push({ name: key, type: fieldType });
  }

  return fields;
}

function stringifyTypedData(request: EvmTypedDataSignRequest): string {
  const types = request.types.EIP712Domain
    ? request.types
    : {
        ...request.types,
        EIP712Domain: createEip712DomainFields(request.domain),
      };

  return JSON.stringify(
    {
      domain: request.domain,
      types,
      primaryType: request.primaryType,
      message: request.message,
    },
    bigintReplacer,
  );
}

async function serializeUnsignedEvmTransaction(
  chainId: string,
  from: Address,
  request: Extract<TransactionExecutionRequest, { format: "evm-transaction" }>,
): Promise<string> {
  const chainName = getChainName(chainId);
  if (chainName === chainId) {
    throw new Error(
      `Unsupported EVM chain ID for local OWS execution: ${chainId}`,
    );
  }

  const publicClient = getPublicClient(chainName);
  const nonce = await publicClient.getTransactionCount({
    address: from,
  });
  const gas = await publicClient.estimateGas({
    account: from,
    to: request.to,
    data: ensureHexPrefix(request.data),
    value: request.value,
  });
  const gasPrice = await publicClient.getGasPrice();
  const serialized = serializeTransaction({
    type: "eip1559",
    chainId: Number.parseInt(chainId.split(":")[1] ?? "", 10),
    nonce,
    gas,
    maxFeePerGas: gasPrice,
    maxPriorityFeePerGas: 0n,
    to: request.to,
    data: ensureHexPrefix(request.data),
    value: request.value,
  });

  return serialized.startsWith("0x") ? serialized.slice(2) : serialized;
}

// ---------------------------------------------------------------------------
// OwsSigner — delegates to OWS SDK
// ---------------------------------------------------------------------------

export class OwsSigner implements WalletPort {
  readonly accountLabel: string;
  readonly address: string;
  private readonly walletId: string;
  private readonly vaultPath: string;
  private cachedPassphrase: string | undefined | null = null; // null = not yet resolved

  constructor(wallet: Extract<ResolvedAccount, { custody: "local" }>) {
    this.accountLabel = wallet.label;
    this.address = wallet.address;
    this.walletId = wallet.walletId;
    this.vaultPath = wallet.vaultPath;
  }

  private async getPassphrase(): Promise<string | undefined> {
    if (this.cachedPassphrase !== null) {
      return this.cachedPassphrase;
    }
    this.cachedPassphrase = await resolveOwsPassphrase();
    return this.cachedPassphrase;
  }

  async signTypedData(
    chainId: string,
    request: EvmTypedDataSignRequest,
    _context?: WalletOperationContext,
    _prompt?: ApprovalPrompt,
  ): Promise<Hex> {
    const passphrase = await this.getPassphrase();
    const family = getChainFamily(chainId);
    const typedDataJson = stringifyTypedData(request);
    const result = owsSignTypedData(
      this.walletId,
      family,
      typedDataJson,
      passphrase,
      undefined,
      this.vaultPath,
    );
    return ensureHexPrefix(result.signature) as Hex;
  }

  async signAndSendTransaction(
    chainId: string,
    request: TransactionExecutionRequest,
    _context?: WalletOperationContext,
    _prompt?: ApprovalPrompt,
    _intent?: TransactionIntent,
  ): Promise<Hash | string> {
    const passphrase = await this.getPassphrase();
    const family = getChainFamily(chainId);
    if (family === "evm") {
      if (request.format !== "evm-transaction") {
        throw new Error(
          `Expected an evm-transaction request for chain ${chainId}, received ${request.format}.`,
        );
      }
      const txHex = await serializeUnsignedEvmTransaction(
        chainId,
        this.address as Address,
        request,
      );
      const chainName = getChainName(chainId);
      const result = owsSignAndSend(
        this.walletId,
        family,
        txHex,
        passphrase,
        undefined,
        getRpcUrlForChain(chainName),
        this.vaultPath,
      );
      return result.txHash as Hash;
    }

    if (request.format !== "solana-versioned-transaction") {
      throw new Error(
        `Expected a solana-versioned-transaction request for chain ${chainId}, received ${request.format}.`,
      );
    }

    const txBytes = Buffer.from(request.serializedTransactionBase64, "base64");
    const txHex = txBytes.toString("hex");
    const result = owsSignAndSend(
      this.walletId,
      family,
      txHex,
      passphrase,
      undefined,
      undefined,
      this.vaultPath,
    );
    return result.txHash;
  }

  async signProtocolPayload(
    request: ProtocolPayloadRequest,
    _context?: WalletOperationContext,
  ): Promise<ProtocolPayloadSignature> {
    if (request.protocol !== "hyperliquid") {
      throw new Error(`Unsupported protocol payload: ${request.protocol}`);
    }

    const passphrase = await this.getPassphrase();
    const privateKey = await exportOwsPrivateKey(
      this.accountLabel,
      "evm",
      this.vaultPath,
      passphrase,
    );
    return {
      protocol: "hyperliquid",
      signature: signHyperliquidL1Action(privateKey, request.payload),
    };
  }
}

// ---------------------------------------------------------------------------
// HTTP transport helpers
// ---------------------------------------------------------------------------

const LOCAL_SIGNER_SERVICE_HOSTS = new Set([
  "127.0.0.1",
  "::1",
  "[::1]",
  "localhost",
]);
const SUPPORTED_SIGNER_OPERATIONS = new Set<SignerCommandRequest["operation"]>([
  "sign-and-send-transaction",
  "sign-protocol-payload",
  "sign-typed-data",
]);
const SIGNER_AUTH_ENV_PATTERN = /^WOOO_SIGNER_AUTH_[A-Z0-9_]*$/;
const DEFAULT_HTTP_SIGNER_POLL_INTERVAL_MS = 1_000;
const DEFAULT_HTTP_SIGNER_TIMEOUT_MS = 5 * 60 * 1_000;
const DEFAULT_HTTP_SIGNER_REQUEST_TIMEOUT_MS = 30_000;
const HTTP_SIGNER_INITIAL_REQUEST_MAX_ATTEMPTS = 2;

export function normalizeSignerUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid signer URL: ${message}`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(
      `Unsupported signer URL protocol: ${url.protocol}. Use http:// or https://.`,
    );
  }

  if (
    url.protocol === "http:" &&
    !LOCAL_SIGNER_SERVICE_HOSTS.has(url.hostname)
  ) {
    throw new Error(
      `Signer URL must use https:// unless it points to a local host. Received host "${url.hostname}".`,
    );
  }

  return url.toString();
}

function isHttpSignerMetadata(value: unknown): value is HttpSignerMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const metadata = value as {
    accounts?: unknown;
    kind?: unknown;
    transport?: unknown;
    version?: unknown;
  };

  return (
    metadata.version === 1 &&
    metadata.kind === "wooo-wallet-transport" &&
    metadata.transport === "http-signer" &&
    Array.isArray(metadata.accounts) &&
    metadata.accounts.every(
      (account) =>
        account &&
        typeof account === "object" &&
        !Array.isArray(account) &&
        "address" in account &&
        typeof account.address === "string" &&
        "chainFamily" in account &&
        (account.chainFamily === "evm" || account.chainFamily === "solana") &&
        "operations" in account &&
        Array.isArray(account.operations) &&
        account.operations.every(
          (item: unknown) =>
            typeof item === "string" &&
            SUPPORTED_SIGNER_OPERATIONS.has(
              item as SignerCommandRequest["operation"],
            ),
        ),
    )
  );
}

export function validateSignerAuthEnv(authEnv?: string): string | undefined {
  if (!authEnv) {
    return undefined;
  }

  if (!SIGNER_AUTH_ENV_PATTERN.test(authEnv)) {
    throw new Error(
      `Signer auth env "${authEnv}" is not allowed. Use a dedicated env name that matches ${SIGNER_AUTH_ENV_PATTERN.source}.`,
    );
  }

  return authEnv;
}

function resolveAuthToken(authEnv?: string): string | null {
  const validatedAuthEnv = validateSignerAuthEnv(authEnv);
  if (!validatedAuthEnv) {
    return null;
  }

  const value = process.env[validatedAuthEnv];
  if (!value?.trim()) {
    throw new Error(
      `Signer auth env "${validatedAuthEnv}" is not set or is empty.`,
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

  const token = resolveAuthToken(options?.authEnv);
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  return headers;
}

export async function fetchSignerMetadata(
  rawUrl: string,
  authEnv?: string,
): Promise<HttpSignerMetadata> {
  const url = normalizeSignerUrl(rawUrl);
  const response = await fetchHttpSigner(url, {
    method: "GET",
    headers: createHttpSignerHeaders({ authEnv }),
  });

  const payload = await response.text();
  if (!response.ok) {
    throw new Error(
      `Signer metadata request failed with HTTP ${response.status}: ${payload || "<empty>"}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Signer returned invalid JSON metadata: ${message}`);
  }

  if (!isHttpSignerMetadata(parsed)) {
    throw new Error("Signer returned an invalid metadata payload");
  }

  if (parsed.accounts.length === 0) {
    throw new Error("Signer did not advertise any accounts");
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// HTTP signer invocation
// ---------------------------------------------------------------------------

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

function getHttpSignerRequestTimeoutMs(): number {
  return parsePositiveIntegerEnv(
    "WOOO_HTTP_SIGNER_REQUEST_TIMEOUT_MS",
    DEFAULT_HTTP_SIGNER_REQUEST_TIMEOUT_MS,
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

class HttpSignerTransportError extends Error {
  readonly retryable: boolean;

  constructor(message: string, options?: { retryable?: boolean }) {
    super(message);
    this.name = "HttpSignerTransportError";
    this.retryable = options?.retryable ?? false;
  }
}

async function fetchHttpSigner(
  url: string,
  init: RequestInit,
  transportLabel = "HTTP signer",
): Promise<Response> {
  const timeoutMs = getHttpSignerRequestTimeoutMs();
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new HttpSignerTransportError(
        `${transportLabel} at ${url} timed out after ${timeoutMs}ms`,
        { retryable: true },
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new HttpSignerTransportError(
      `${transportLabel} at ${url} failed: ${message}`,
      { retryable: true },
    );
  } finally {
    clearTimeout(timeoutHandle);
  }
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
    const response = await fetchHttpSigner(
      statusUrl,
      {
        method: "GET",
        headers: createHttpSignerHeaders({
          authEnv: options?.authEnv,
        }),
      },
      transportLabel,
    );
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
  signerUrl: string,
  authEnv: string | undefined,
  request: SignerCommandRequest,
): Promise<SignerCommandTerminalResponse> {
  const transportLabel = "HTTP signer";
  let attempt = 0;

  while (true) {
    attempt += 1;

    try {
      const response = await fetchHttpSigner(
        signerUrl,
        {
          method: "POST",
          headers: createHttpSignerHeaders({
            authEnv,
            includeJsonContentType: true,
          }),
          body: serializeSignerPayload(request),
        },
        transportLabel,
      );
      const parsed = await parseHttpSignerResponse(
        signerUrl,
        response,
        transportLabel,
      );

      if (!response.ok) {
        if (!parsed.ok) {
          throw new Error(parsed.error);
        }
        throw new Error(
          `${transportLabel} at ${signerUrl} returned HTTP ${response.status}`,
        );
      }

      if (!parsed.ok) {
        throw new Error(parsed.error);
      }

      return await pollHttpSignerResponse(signerUrl, parsed, {
        authEnv,
        transportLabel,
      });
    } catch (error) {
      if (
        error instanceof HttpSignerTransportError &&
        error.retryable &&
        attempt < HTTP_SIGNER_INITIAL_REQUEST_MAX_ATTEMPTS
      ) {
        continue;
      }

      throw error;
    }
  }
}

// ---------------------------------------------------------------------------
// ExternalSigner — delegates to external HTTP transport
// ---------------------------------------------------------------------------

export class ExternalSigner implements WalletPort {
  readonly accountLabel: string;
  readonly address: string;
  private readonly chainFamily: "evm" | "solana";
  private readonly signerUrl: string;
  private readonly authEnv: string | undefined;

  constructor(wallet: Extract<ResolvedAccount, { custody: "remote" }>) {
    this.accountLabel = wallet.label;
    this.address = wallet.address;
    this.chainFamily = wallet.chainFamily;
    this.signerUrl = normalizeSignerUrl(wallet.signerUrl);
    this.authEnv = validateSignerAuthEnv(wallet.authEnv);
  }

  private toAccountRef() {
    return {
      address: this.address,
      chainFamily: this.chainFamily,
      label: this.accountLabel,
    };
  }

  async signTypedData(
    chainId: string,
    request: EvmTypedDataSignRequest,
    context?: WalletOperationContext,
    prompt?: ApprovalPrompt,
  ): Promise<Hex> {
    const response = await invokeHttpSigner(this.signerUrl, this.authEnv, {
      clientRequestId: randomUUID(),
      version: 1,
      operation: "sign-typed-data",
      account: this.toAccountRef(),
      context,
      chainId,
      typedData: request,
      prompt,
    });

    if (!response.ok || !("signatureHex" in response)) {
      throw new Error(
        response.ok
          ? "Signer did not return typed data signature"
          : response.error,
      );
    }
    return response.signatureHex as Hex;
  }

  async signAndSendTransaction(
    chainId: string,
    request: TransactionExecutionRequest,
    context?: WalletOperationContext,
    prompt?: ApprovalPrompt,
    intent?: TransactionIntent,
  ): Promise<Hash | string> {
    const response = await invokeHttpSigner(this.signerUrl, this.authEnv, {
      clientRequestId: randomUUID(),
      version: 1,
      operation: "sign-and-send-transaction",
      account: this.toAccountRef(),
      context,
      chainId,
      transaction: request,
      intent,
      prompt,
    });

    if (!response.ok || !("txHash" in response)) {
      throw new Error(
        response.ok ? "Signer did not return tx hash" : response.error,
      );
    }
    return response.txHash;
  }

  async signProtocolPayload(
    request: ProtocolPayloadRequest,
    context?: WalletOperationContext,
  ): Promise<ProtocolPayloadSignature> {
    const response = await invokeHttpSigner(this.signerUrl, this.authEnv, {
      clientRequestId: randomUUID(),
      version: 1,
      operation: "sign-protocol-payload",
      account: this.toAccountRef(),
      context,
      payload: request,
    });

    if (!response.ok || !("signature" in response)) {
      throw new Error(
        response.ok
          ? "Signer did not return Hyperliquid signature"
          : response.error,
      );
    }
    return {
      protocol: request.protocol,
      signature: response.signature,
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createWalletPort(account: ResolvedAccount): WalletPort {
  if (account.custody === "local") {
    return new OwsSigner(account);
  }
  return new ExternalSigner(account);
}
