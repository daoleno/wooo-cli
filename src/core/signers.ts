import { password as clackPassword } from "@clack/prompts";
import {
  signAndSend as owsSignAndSend,
  signMessage as owsSignMessage,
  signTypedData as owsSignTypedData,
} from "@open-wallet-standard/core";
import { encodeFunctionData, type Hash, type Hex, hexToSignature } from "viem";
import { getChainFamily, getChainName } from "./chain-ids";
import type { ExternalTransport } from "./external-wallets";
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
    }
  | {
      source: "external";
      name: string;
      address: string;
      chainId: string;
      transport: ExternalTransport;
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

  // Generic message signing
  signMessage(
    chainId: string,
    message: string,
    origin?: SignerRequestOrigin,
  ): Promise<string>;
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

// ---------------------------------------------------------------------------
// Passphrase resolution for OWS signer
// ---------------------------------------------------------------------------

async function resolveOwsPassphrase(): Promise<string | undefined> {
  // OWS_API_KEY means agent/API access — no passphrase needed
  if (process.env.OWS_API_KEY) {
    return undefined;
  }

  // Explicit passphrase from env
  if (process.env.OWS_PASSPHRASE) {
    return process.env.OWS_PASSPHRASE;
  }

  // Interactive prompt
  const result = await clackPassword({
    message: "Enter wallet passphrase:",
  });

  if (typeof result === "symbol") {
    throw new Error("Passphrase input was cancelled");
  }

  return result;
}

// ---------------------------------------------------------------------------
// OwsSigner — delegates to OWS SDK
// ---------------------------------------------------------------------------

export class OwsSigner implements WoooSigner {
  readonly walletName: string;
  readonly address: string;
  private readonly walletId: string;
  private readonly chainId: string;
  private cachedPassphrase: string | undefined | null = null; // null = not yet resolved

  constructor(wallet: Extract<ResolvedWallet, { source: "ows" }>) {
    this.walletName = wallet.name;
    this.address = wallet.address;
    this.walletId = wallet.walletId;
    this.chainId = wallet.chainId;
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
    const typedDataJson = JSON.stringify(
      {
        domain: request.domain,
        types: request.types,
        primaryType: request.primaryType,
        message: request.message,
      },
      bigintReplacer,
    );
    const result = owsSignTypedData(
      this.walletId,
      family,
      typedDataJson,
      passphrase,
    );
    return result.signature as Hex;
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

    // Get the chain name to look up an RPC URL
    const _chainName = getChainName(chainId);

    const result = owsSignAndSend(
      this.walletId,
      family,
      txHex,
      passphrase,
      undefined,
      undefined, // rpcUrl — OWS resolves from chain
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

    const result = owsSignAndSend(this.walletId, family, txHex, passphrase);
    return result.txHash;
  }

  async signHyperliquidL1Action(
    request: HyperliquidActionSigningRequest,
    _origin?: SignerRequestOrigin,
  ): Promise<HyperliquidActionSignature> {
    const passphrase = await this.getPassphrase();

    // Construct EIP-712 typed data matching Hyperliquid's format
    const domain = {
      name: "Exchange",
      version: "1",
      chainId: request.sandbox ? 421614 : 42161,
      verifyingContract: "0x0000000000000000000000000000000000000000",
    };

    const types: Record<string, Array<{ name: string; type: string }>> = {
      "HyperliquidTransaction:Approve": [
        { name: "hyperliquidChain", type: "string" },
        { name: "destination", type: "string" },
        { name: "isMainnet", type: "bool" },
      ],
    };

    // Determine the primary type based on action
    const primaryType = "HyperliquidTransaction:Approve";

    const message: Record<string, unknown> = {
      hyperliquidChain: request.sandbox ? "Testnet" : "Mainnet",
      destination: request.vaultAddress ?? "a]",
      isMainnet: !request.sandbox,
    };

    // Add action-specific fields
    if (request.action) {
      for (const [key, value] of Object.entries(request.action)) {
        message[key] = value;
      }
    }

    const typedDataJson = JSON.stringify(
      { domain, types, primaryType, message },
      bigintReplacer,
    );

    const result = owsSignTypedData(
      this.walletId,
      "evm",
      typedDataJson,
      passphrase,
    );

    // Parse the hex signature into {r, s, v}
    const sig = hexToSignature(result.signature as Hex);
    return {
      r: sig.r,
      s: sig.s,
      v: Number(sig.v),
    };
  }

  async signMessage(
    chainId: string,
    message: string,
    _origin?: SignerRequestOrigin,
  ): Promise<string> {
    const passphrase = await this.getPassphrase();
    const family = getChainFamily(chainId);
    const result = owsSignMessage(this.walletId, family, message, passphrase);
    return result.signature;
  }
}

// ---------------------------------------------------------------------------
// HTTP transport helpers
// ---------------------------------------------------------------------------

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
  transport: ExternalTransport,
  _walletName: string,
  request: SignerCommandRequest,
): Promise<SignerCommandTerminalResponse> {
  const transportLabel = "Signer transport";
  const authEnv = transport.authEnv;

  const response = await fetch(transport.url, {
    method: "POST",
    headers: createHttpSignerHeaders({
      authEnv,
      includeJsonContentType: true,
    }),
    body: serializeSignerPayload(request),
  });
  const parsed = await parseHttpSignerResponse(
    transport.url,
    response,
    transportLabel,
  );

  if (!response.ok) {
    if (!parsed.ok) {
      throw new Error(parsed.error);
    }
    throw new Error(
      `${transportLabel} at ${transport.url} returned HTTP ${response.status}`,
    );
  }

  if (!parsed.ok) {
    throw new Error(parsed.error);
  }

  return await pollHttpSignerResponse(transport.url, parsed, {
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
  private readonly transport: ExternalTransport;

  constructor(wallet: Extract<ResolvedWallet, { source: "external" }>) {
    this.walletName = wallet.name;
    this.address = wallet.address;
    this.chainId = wallet.chainId;
    this.transport = wallet.transport;
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
    const response = await invokeHttpSigner(this.transport, this.walletName, {
      version: 1,
      kind: "evm-sign-typed-data",
      wallet: this.toWalletContext(),
      origin,
      chainName,
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

  async writeContract(
    chainId: string,
    request: EvmContractWriteRequest,
    origin?: SignerRequestOrigin,
    prompt?: SignerPrompt,
    approval?: EvmApprovalRequest,
  ): Promise<Hash> {
    const chainName = getChainName(chainId);
    const response = await invokeHttpSigner(this.transport, this.walletName, {
      version: 1,
      kind: "evm-write-contract",
      wallet: this.toWalletContext(),
      origin,
      chainName,
      contract: request,
      approval,
      prompt,
    });

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
    const response = await invokeHttpSigner(this.transport, this.walletName, {
      version: 1,
      kind: "solana-send-versioned-transaction",
      wallet: this.toWalletContext(),
      origin,
      network,
      serializedTransactionBase64: serializedTx,
      prompt,
    });

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
    const response = await invokeHttpSigner(this.transport, this.walletName, {
      version: 1,
      kind: "hyperliquid-sign-l1-action",
      wallet: this.toWalletContext(),
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
  }

  async signMessage(
    _chainId: string,
    _message: string,
    _origin?: SignerRequestOrigin,
  ): Promise<string> {
    // Sign message is not a standard signer-protocol command yet.
    // For external signers, we use the typed data path with a simple message wrapper.
    // This is a placeholder that should be extended when the signer protocol adds message signing.
    throw new Error(
      "signMessage is not yet supported for external signer transports",
    );
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
