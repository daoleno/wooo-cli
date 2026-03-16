import type { Abi, Address, Hash } from "viem";

export type WalletAuthKind = "command" | "local-keystore" | "service";

export interface SignerWalletContext {
  name: string;
  address: string;
  chain: string;
  authKind: WalletAuthKind;
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

export interface SignerServiceWalletDescriptor {
  address: string;
  chain: "evm" | "solana";
}

export interface SignerServiceMetadata {
  kind: "wooo-signer-service";
  supportedKinds: SignerCommandRequestBase["kind"][];
  version: 1;
  wallets: SignerServiceWalletDescriptor[];
}

interface SignerCommandRequestBase {
  kind:
    | "evm-write-contract"
    | "hyperliquid-sign-l1-action"
    | "solana-send-versioned-transaction";
  origin?: SignerRequestOrigin;
  version: 1;
  wallet: SignerWalletContext;
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
  | EvmWriteContractCommandRequest
  | HyperliquidSignCommandRequest
  | SolanaSendTransactionCommandRequest;

interface SignerCommandResponseBase {
  ok: boolean;
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

export interface SignerCommandErrorResponse extends SignerCommandResponseBase {
  ok: false;
  error: string;
}

export type SignerCommandResponse =
  | SignerCommandErrorResponse
  | SignerCommandSignatureResponse
  | SignerCommandTxHashResponse;

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
