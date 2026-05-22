import type { Address, Hash, Hex } from "viem";
import type { ChainFamily } from "./chain-ids";

export interface TransportAccountRef {
  address: string;
  chainFamily: ChainFamily;
  label?: string;
}

export type ApprovalPromptValue = boolean | number | string | null;

export interface ApprovalPrompt {
  action: string;
  details?: Record<string, ApprovalPromptValue>;
}

export interface WalletOperationContext {
  command?: string;
  group?: string;
  protocol?: string;
}

export interface TokenApprovalIntent {
  amount: bigint;
  kind: "token-approval";
  spender: Address;
  token: Address;
}

export type TransactionIntent = TokenApprovalIntent;

export interface EvmTransactionRequest {
  data: Hex | string;
  format: "evm-transaction";
  to: Address;
  value?: bigint;
}

export interface SolanaVersionedTransactionRequest {
  format: "solana-versioned-transaction";
  serializedTransactionBase64: string;
}

export type TransactionExecutionRequest =
  | EvmTransactionRequest
  | SolanaVersionedTransactionRequest;

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
  expiresAfter?: number;
  nonce: number;
  prompt?: ApprovalPrompt;
  sandbox?: boolean;
  vaultAddress?: string;
}

export interface HyperliquidActionSignature {
  r: `0x${string}`;
  s: `0x${string}`;
  v: number;
}

export interface ProtocolPayloadRequest {
  payload: HyperliquidActionSigningRequest;
  protocol: "hyperliquid";
}

export interface ProtocolPayloadSignature {
  protocol: "hyperliquid";
  signature: HyperliquidActionSignature;
}

export type WalletTransportOperation =
  | "sign-and-send-transaction"
  | "sign-protocol-payload"
  | "sign-typed-data";

export interface AdvertisedAccountDescriptor {
  address: string;
  chainFamily: ChainFamily;
  operations: WalletTransportOperation[];
}

export interface HttpSignerMetadata {
  accounts: AdvertisedAccountDescriptor[];
  kind: "wooo-wallet-transport";
  transport: "http-signer";
  version: 1;
}

interface WalletTransportRequestBase {
  account: TransportAccountRef;
  clientRequestId: string;
  context?: WalletOperationContext;
  operation: WalletTransportOperation;
  version: 1;
}

export interface SignTypedDataCommandRequest
  extends WalletTransportRequestBase {
  chainId: string;
  operation: "sign-typed-data";
  prompt?: ApprovalPrompt;
  typedData: EvmTypedDataSignRequest;
}

export interface SignAndSendTransactionCommandRequest
  extends WalletTransportRequestBase {
  chainId: string;
  intent?: TransactionIntent;
  operation: "sign-and-send-transaction";
  prompt?: ApprovalPrompt;
  transaction: TransactionExecutionRequest;
}

export interface SignProtocolPayloadCommandRequest
  extends WalletTransportRequestBase {
  operation: "sign-protocol-payload";
  payload: ProtocolPayloadRequest;
}

export type SignerCommandRequest =
  | SignAndSendTransactionCommandRequest
  | SignProtocolPayloadCommandRequest
  | SignTypedDataCommandRequest;

interface WalletTransportResponseBase {
  ok: boolean;
}

export interface SignerCommandPendingResponse
  extends WalletTransportResponseBase {
  ok: true;
  pollAfterMs?: number;
  requestId: string;
  status: "pending";
}

export interface SignerCommandTxHashResponse
  extends WalletTransportResponseBase {
  ok: true;
  txHash: Hash | string;
}

export interface SignerCommandSignatureResponse
  extends WalletTransportResponseBase {
  ok: true;
  signature: HyperliquidActionSignature;
}

export interface SignerCommandHexSignatureResponse
  extends WalletTransportResponseBase {
  ok: true;
  signatureHex: Hex | string;
}

export interface SignerCommandErrorResponse
  extends WalletTransportResponseBase {
  error: string;
  ok: false;
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
