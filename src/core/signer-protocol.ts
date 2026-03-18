import type { Abi, Address, Hash, Hex } from "viem";

export type WalletMode = "local" | "external";

export interface SignerWalletContext {
  name: string;
  address: string;
  chain: string;
  mode: WalletMode;
}

export type SignerPromptValue = boolean | number | string | null;

export interface SignerPrompt {
  action: string;
  details?: Record<string, SignerPromptValue>;
}

export interface SignerRequestOrigin {
  command?: string;
  group?: string;
  protocol?: string;
}

export interface EvmContractWriteRequest {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
}

export interface EvmApprovalRequest {
  amount: bigint;
  spender: Address;
  token: Address;
}

export interface EvmTypedDataField {
  name: string;
  type: string;
}

export interface EvmTypedDataSignRequest {
  domain: Record<string, unknown>;
  message: Record<string, unknown>;
  primaryType: string;
  types: Record<string, EvmTypedDataField[]>;
}

export interface HyperliquidActionContext {
  actionType?: string;
  leverage?: number;
  side?: "buy" | "sell" | "long" | "short";
  sizeUsd?: number;
  symbol?: string;
}

export interface HyperliquidActionSigningRequest {
  action: Record<string, unknown>;
  context?: HyperliquidActionContext;
  nonce: number;
  vaultAddress?: string;
  expiresAfter?: number;
  sandbox?: boolean;
  prompt?: SignerPrompt;
}

export interface HyperliquidActionSignature {
  r: `0x${string}`;
  s: `0x${string}`;
  v: number;
}

export interface AdvertisedWalletDescriptor {
  address: string;
  chain: "evm" | "solana";
}

export type HttpSignerMetadataKind =
  | "wooo-signer-service"
  | "wooo-wallet-broker";

interface HttpSignerMetadataBase {
  kind: HttpSignerMetadataKind;
  supportedKinds: SignerCommandRequestBase["kind"][];
  version: 1;
  wallets: AdvertisedWalletDescriptor[];
}

export interface SignerServiceMetadata extends HttpSignerMetadataBase {
  kind: "wooo-signer-service";
}

export interface SignerBrokerMetadata extends HttpSignerMetadataBase {
  kind: "wooo-wallet-broker";
}

export type HttpSignerMetadata = SignerServiceMetadata | SignerBrokerMetadata;

interface SignerCommandRequestBase {
  kind:
    | "evm-sign-typed-data"
    | "evm-write-contract"
    | "hyperliquid-sign-l1-action"
    | "solana-send-versioned-transaction";
  origin?: SignerRequestOrigin;
  version: 1;
  wallet: SignerWalletContext;
}

export interface EvmSignTypedDataCommandRequest
  extends SignerCommandRequestBase {
  kind: "evm-sign-typed-data";
  chainName: string;
  prompt?: SignerPrompt;
  typedData: EvmTypedDataSignRequest;
}

export interface EvmWriteContractCommandRequest
  extends SignerCommandRequestBase {
  approval?: EvmApprovalRequest;
  kind: "evm-write-contract";
  chainName: string;
  contract: EvmContractWriteRequest;
  prompt?: SignerPrompt;
}

export interface HyperliquidSignCommandRequest
  extends SignerCommandRequestBase {
  kind: "hyperliquid-sign-l1-action";
  request: HyperliquidActionSigningRequest;
}

export interface SolanaSendTransactionCommandRequest
  extends SignerCommandRequestBase {
  kind: "solana-send-versioned-transaction";
  network: string;
  serializedTransactionBase64: string;
  prompt?: SignerPrompt;
}

export type SignerCommandRequest =
  | EvmSignTypedDataCommandRequest
  | EvmWriteContractCommandRequest
  | HyperliquidSignCommandRequest
  | SolanaSendTransactionCommandRequest;

interface SignerCommandResponseBase {
  ok: boolean;
}

export interface SignerCommandPendingResponse
  extends SignerCommandResponseBase {
  ok: true;
  pollAfterMs?: number;
  requestId: string;
  status: "pending";
}

export interface SignerCommandTxHashResponse extends SignerCommandResponseBase {
  ok: true;
  txHash: Hash | string;
}

export interface SignerCommandSignatureResponse
  extends SignerCommandResponseBase {
  ok: true;
  signature: HyperliquidActionSignature;
}

export interface SignerCommandHexSignatureResponse
  extends SignerCommandResponseBase {
  ok: true;
  signatureHex: Hex | string;
}

export interface SignerCommandErrorResponse extends SignerCommandResponseBase {
  ok: false;
  error: string;
}

export type SignerCommandTerminalResponse =
  | SignerCommandErrorResponse
  | SignerCommandHexSignatureResponse
  | SignerCommandSignatureResponse
  | SignerCommandTxHashResponse;

export type SignerCommandResponse =
  | SignerCommandPendingResponse
  | SignerCommandTerminalResponse;

export function isSignerCommandPendingResponse(
  value: SignerCommandResponse,
): value is SignerCommandPendingResponse {
  return value.ok === true && "status" in value && value.status === "pending";
}

export function isSignerCommandResponse(
  value: unknown,
): value is SignerCommandResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const response = value as Record<string, unknown>;
  if (response.ok === false) {
    return typeof response.error === "string";
  }

  if (response.ok !== true) {
    return false;
  }

  if (response.status === "pending") {
    return (
      typeof response.requestId === "string" &&
      (response.pollAfterMs === undefined ||
        (typeof response.pollAfterMs === "number" &&
          Number.isFinite(response.pollAfterMs) &&
          response.pollAfterMs >= 0))
    );
  }

  if (typeof response.txHash === "string") {
    return true;
  }

  if (typeof response.signatureHex === "string") {
    return true;
  }

  if (
    response.signature &&
    typeof response.signature === "object" &&
    !Array.isArray(response.signature)
  ) {
    const signature = response.signature as Record<string, unknown>;
    return (
      typeof signature.r === "string" &&
      typeof signature.s === "string" &&
      typeof signature.v === "number" &&
      Number.isFinite(signature.v)
    );
  }

  return false;
}

function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") {
    return { $type: "bigint", value: value.toString() };
  }
  return value;
}

function jsonReviver(_key: string, value: unknown): unknown {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "$type" in value &&
    "value" in value
  ) {
    const typedValue = value as { $type?: string; value?: unknown };
    if (typedValue.$type === "bigint" && typeof typedValue.value === "string") {
      return BigInt(typedValue.value);
    }
  }
  return value;
}

export function serializeSignerPayload(value: unknown): string {
  return JSON.stringify(value, jsonReplacer, 2);
}

export function deserializeSignerPayload<T>(value: string): T {
  return JSON.parse(value, jsonReviver) as T;
}
