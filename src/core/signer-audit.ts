import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { ensureConfigDir, getConfigDir } from "./config";
import type { SignerCommandRequest } from "./signer-protocol";

interface SignerAuditRequestDetails {
  approval?: {
    amount: string;
    spender: string;
    token: string;
  };
  chainName?: string;
  contract?: {
    address: string;
    functionName: string;
    value: string;
  };
  domainName?: string;
  expiresAfter?: number;
  network?: string;
  primaryType?: string;
  sandbox?: boolean;
  side?: string;
  sizeUsd?: number;
  symbol?: string;
  transactionBytes?: number;
  type?: string;
  vaultAddress?: string;
  leverage?: number;
}

interface SignerAuditEntry {
  autoApproved: boolean;
  error?: string;
  kind: SignerCommandRequest["kind"];
  origin?: SignerCommandRequest["origin"];
  request: SignerAuditRequestDetails;
  status: "approved" | "rejected";
  timestamp: string;
  wallet: {
    address: string;
    chain: string;
    mode: string;
    name: string;
  };
}

function getAuditPath(): string {
  ensureConfigDir();
  return join(getConfigDir(), "signer-audit.jsonl");
}

function getRequestDetails(
  request: SignerCommandRequest,
): SignerAuditRequestDetails {
  if (request.kind === "evm-sign-typed-data") {
    return {
      chainName: request.chainName,
      primaryType: request.typedData.primaryType,
      ...(typeof request.typedData.domain.name === "string"
        ? { domainName: request.typedData.domain.name }
        : {}),
    };
  }

  if (request.kind === "evm-write-contract") {
    return {
      chainName: request.chainName,
      contract: {
        address: request.contract.address,
        functionName: request.contract.functionName,
        value: (request.contract.value ?? 0n).toString(),
      },
      ...(request.approval
        ? {
            approval: {
              token: request.approval.token,
              spender: request.approval.spender,
              amount: request.approval.amount.toString(),
            },
          }
        : {}),
    };
  }

  if (request.kind === "solana-send-versioned-transaction") {
    return {
      network: request.network,
      transactionBytes: Buffer.from(
        request.serializedTransactionBase64,
        "base64",
      ).length,
    };
  }

  return {
    type: String(request.request.action.type ?? "unknown"),
    ...(request.request.context?.symbol
      ? { symbol: request.request.context.symbol }
      : {}),
    ...(request.request.context?.side
      ? { side: request.request.context.side }
      : {}),
    ...(request.request.context?.leverage !== undefined
      ? { leverage: request.request.context.leverage }
      : {}),
    ...(request.request.context?.sizeUsd !== undefined
      ? { sizeUsd: request.request.context.sizeUsd }
      : {}),
    ...(request.request.vaultAddress
      ? { vaultAddress: request.request.vaultAddress }
      : {}),
    ...(request.request.expiresAfter !== undefined
      ? { expiresAfter: request.request.expiresAfter }
      : {}),
    ...(request.request.sandbox !== undefined
      ? { sandbox: request.request.sandbox }
      : {}),
  };
}

export function appendSignerAudit(
  request: SignerCommandRequest,
  status: "approved" | "rejected",
  autoApproved: boolean,
  error?: string,
): void {
  const entry: SignerAuditEntry = {
    timestamp: new Date().toISOString(),
    status,
    autoApproved,
    kind: request.kind,
    origin: request.origin,
    request: getRequestDetails(request),
    wallet: {
      name: request.wallet.name,
      address: request.wallet.address,
      chain: request.wallet.chain,
      mode: request.wallet.mode,
    },
    error,
  };

  appendFileSync(getAuditPath(), `${JSON.stringify(entry)}\n`);
}
