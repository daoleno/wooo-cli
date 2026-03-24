import {
  signAndSend as owsSignAndSend,
  signTypedData as owsSignTypedData,
} from "@open-wallet-standard/core";
import { encodeFunctionData, type Hash, type Hex } from "viem";
import { getChainFamily, getChainName } from "./chain-ids";
import { signHyperliquidL1Action } from "./hyperliquid-signing";
import {
  ensureHexPrefix,
  exportOwsPrivateKey,
  resolveOwsPassphrase,
} from "./ows";
import type {
  EvmApprovalRequest,
  EvmContractWriteRequest,
  EvmTypedDataSignRequest,
  HttpSignerMetadata,
  HyperliquidActionSignature,
  HyperliquidActionSigningRequest,
  SignerCommandRequest,
  SignerCommandResponse,
  SignerCommandTerminalResponse,
  SignerPrompt,
  SignerRequestOrigin,
} from "./signer-protocol";
import {
  deserializeSignerPayload,
  isSignerCommandPendingResponse,
  isSignerCommandResponse,
  serializeSignerPayload,
} from "./signer-protocol";

// ---------------------------------------------------------------------------
// ResolvedWallet type
// ---------------------------------------------------------------------------

export type ResolvedWallet =
  | {
      source: "ows";
      name: string;
      walletId: string;
      address: string;
      chainId: string;
      vaultPath: string;
    }
  | {
      source: "external";
      name: string;
      address: string;
      chainId: string;
      signerUrl: string;
      authEnv?: string;
    };

// ---------------------------------------------------------------------------
// WoooSigner interface
// ---------------------------------------------------------------------------

export interface WoooSigner {
  walletName: string;
  address: string;

  // EVM operations
  signTypedData(
    chainId: string,
    request: EvmTypedDataSignRequest,
    origin?: SignerRequestOrigin,
    prompt?: SignerPrompt,
  ): Promise<Hex>;
  writeContract(
    chainId: string,
    request: EvmContractWriteRequest,
    origin?: SignerRequestOrigin,
    prompt?: SignerPrompt,
    approval?: EvmApprovalRequest,
  ): Promise<Hash>;

  // Solana operations
  sendTransaction(
    network: string,
    serializedTx: string,
    origin?: SignerRequestOrigin,
    prompt?: SignerPrompt,
  ): Promise<string>;

  // Hyperliquid L1 action signing (EIP-712 structured, returns {r, s, v})
  signHyperliquidL1Action(
    request: HyperliquidActionSigningRequest,
    origin?: SignerRequestOrigin,
  ): Promise<HyperliquidActionSignature>;
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

// ---------------------------------------------------------------------------
// OwsSigner — delegates to OWS SDK
// ---------------------------------------------------------------------------

export class OwsSigner implements WoooSigner {
  readonly walletName: string;
  readonly address: string;
  private readonly walletId: string;
  private readonly chainId: string;
  private readonly vaultPath: string;
  private cachedPassphrase: string | undefined | null = null; // null = not yet resolved

  constructor(wallet: Extract<ResolvedWallet, { source: "ows" }>) {
    this.walletName = wallet.name;
    this.address = wallet.address;
    this.walletId = wallet.walletId;
    this.chainId = wallet.chainId;
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
    _origin?: SignerRequestOrigin,
    _prompt?: SignerPrompt,
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

  async writeContract(
    chainId: string,
    request: EvmContractWriteRequest,
    _origin?: SignerRequestOrigin,
    _prompt?: SignerPrompt,
    _approval?: EvmApprovalRequest,
  ): Promise<Hash> {
    const passphrase = await this.getPassphrase();
    const family = getChainFamily(chainId);

    // Encode the contract call data using Viem
    const data = encodeFunctionData({
      abi: request.abi,
      functionName: request.functionName,
      args: request.args as unknown[],
    });

    // Build a raw unsigned transaction object and serialize to hex
    const txObj: Record<string, unknown> = {
      to: request.address,
      data,
    };
    if (request.value !== undefined && request.value !== 0n) {
      txObj.value = `0x${request.value.toString(16)}`;
    }

    const txHex = JSON.stringify(txObj, bigintReplacer);

    const result = owsSignAndSend(
      this.walletId,
      family,
      txHex,
      passphrase,
      undefined,
      undefined, // rpcUrl — OWS resolves from chain
      this.vaultPath,
    );
    return result.txHash as Hash;
  }

  async sendTransaction(
    network: string,
    serializedTx: string,
    _origin?: SignerRequestOrigin,
    _prompt?: SignerPrompt,
  ): Promise<string> {
    const passphrase = await this.getPassphrase();
    const family = getChainFamily(network);

    // Convert base64 to hex for OWS
    const txBytes = Buffer.from(serializedTx, "base64");
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

  async signHyperliquidL1Action(
    request: HyperliquidActionSigningRequest,
    _origin?: SignerRequestOrigin,
  ): Promise<HyperliquidActionSignature> {
    const passphrase = await this.getPassphrase();
    const privateKey = await exportOwsPrivateKey(
      this.walletName,
      "evm",
      this.vaultPath,
      passphrase,
    );
    return signHyperliquidL1Action(privateKey, request);
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
const SUPPORTED_SIGNER_REQUEST_KINDS = new Set<SignerCommandRequest["kind"]>([
  "evm-sign-typed-data",
  "evm-write-contract",
  "hyperliquid-sign-l1-action",
  "solana-send-versioned-transaction",
]);
const DEFAULT_HTTP_SIGNER_POLL_INTERVAL_MS = 1_000;
const DEFAULT_HTTP_SIGNER_TIMEOUT_MS = 5 * 60 * 1_000;

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
    kind?: unknown;
    supportedKinds?: unknown;
    version?: unknown;
    wallets?: unknown;
  };

  return (
    metadata.version === 1 &&
    metadata.kind === "wooo-signer" &&
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

function resolveAuthToken(authEnv?: string): string | null {
  if (!authEnv) {
    return null;
  }

  const value = process.env[authEnv];
  if (!value?.trim()) {
    throw new Error(`Signer auth env "${authEnv}" is not set or is empty.`);
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
  const response = await fetch(url, {
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

  if (parsed.wallets.length === 0) {
    throw new Error("Signer did not advertise any wallets");
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
  signerUrl: string,
  authEnv: string | undefined,
  _walletName: string,
  request: SignerCommandRequest,
): Promise<SignerCommandTerminalResponse> {
  const transportLabel = "HTTP signer";

  const response = await fetch(signerUrl, {
    method: "POST",
    headers: createHttpSignerHeaders({
      authEnv,
      includeJsonContentType: true,
    }),
    body: serializeSignerPayload(request),
  });
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
}

// ---------------------------------------------------------------------------
// ExternalSigner — delegates to external HTTP transport
// ---------------------------------------------------------------------------

export class ExternalSigner implements WoooSigner {
  readonly walletName: string;
  readonly address: string;
  private readonly chainId: string;
  private readonly signerUrl: string;
  private readonly authEnv: string | undefined;

  constructor(wallet: Extract<ResolvedWallet, { source: "external" }>) {
    this.walletName = wallet.name;
    this.address = wallet.address;
    this.chainId = wallet.chainId;
    this.signerUrl = wallet.signerUrl;
    this.authEnv = wallet.authEnv;
  }

  private toWalletContext() {
    const family = getChainFamily(this.chainId);
    return {
      name: this.walletName,
      address: this.address,
      chain: family,
      mode: "external" as const,
    };
  }

  async signTypedData(
    chainId: string,
    request: EvmTypedDataSignRequest,
    origin?: SignerRequestOrigin,
    prompt?: SignerPrompt,
  ): Promise<Hex> {
    const chainName = getChainName(chainId);
    const response = await invokeHttpSigner(
      this.signerUrl,
      this.authEnv,
      this.walletName,
      {
        version: 1,
        kind: "evm-sign-typed-data",
        wallet: this.toWalletContext(),
        origin,
        chainName,
        typedData: request,
        prompt,
      },
    );

    if (!response.ok || !("signatureHex" in response)) {
      throw new Error(
        response.ok
          ? "Signer did not return typed data signature"
          : response.error,
      );
    }
    return response.signatureHex as Hex;
  }

  async writeContract(
    chainId: string,
    request: EvmContractWriteRequest,
    origin?: SignerRequestOrigin,
    prompt?: SignerPrompt,
    approval?: EvmApprovalRequest,
  ): Promise<Hash> {
    const chainName = getChainName(chainId);
    const response = await invokeHttpSigner(
      this.signerUrl,
      this.authEnv,
      this.walletName,
      {
        version: 1,
        kind: "evm-write-contract",
        wallet: this.toWalletContext(),
        origin,
        chainName,
        contract: request,
        approval,
        prompt,
      },
    );

    if (!response.ok || !("txHash" in response)) {
      throw new Error(
        response.ok ? "Signer did not return tx hash" : response.error,
      );
    }
    return response.txHash as Hash;
  }

  async sendTransaction(
    network: string,
    serializedTx: string,
    origin?: SignerRequestOrigin,
    prompt?: SignerPrompt,
  ): Promise<string> {
    const response = await invokeHttpSigner(
      this.signerUrl,
      this.authEnv,
      this.walletName,
      {
        version: 1,
        kind: "solana-send-versioned-transaction",
        wallet: this.toWalletContext(),
        origin,
        network,
        serializedTransactionBase64: serializedTx,
        prompt,
      },
    );

    if (!response.ok || !("txHash" in response)) {
      throw new Error(
        response.ok ? "Signer did not return tx hash" : response.error,
      );
    }
    return String(response.txHash);
  }

  async signHyperliquidL1Action(
    request: HyperliquidActionSigningRequest,
    origin?: SignerRequestOrigin,
  ): Promise<HyperliquidActionSignature> {
    const response = await invokeHttpSigner(
      this.signerUrl,
      this.authEnv,
      this.walletName,
      {
        version: 1,
        kind: "hyperliquid-sign-l1-action",
        wallet: this.toWalletContext(),
        origin,
        request,
      },
    );

    if (!response.ok || !("signature" in response)) {
      throw new Error(
        response.ok
          ? "Signer did not return Hyperliquid signature"
          : response.error,
      );
    }
    return response.signature;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createSigner(wallet: ResolvedWallet): WoooSigner {
  if (wallet.source === "ows") {
    return new OwsSigner(wallet);
  }
  return new ExternalSigner(wallet);
}
