import { maxUint256 } from "viem";
import type {
  HyperliquidSignerPolicy,
  WalletSignerPolicy,
  WoooConfig,
} from "./config";
import type { SignerCommandRequest } from "./signer-protocol";

export interface SignerPolicyDecision {
  allowed: boolean;
  autoApprove: boolean;
  reasons: string[];
}

function normalizeList(values?: string[]): Set<string> {
  return new Set((values ?? []).map((value) => value.trim().toLowerCase()));
}

function parsePolicyBigInt(
  rawValue: string | undefined,
  fieldName: string,
): bigint | null {
  if (!rawValue) {
    return null;
  }

  try {
    return BigInt(rawValue);
  } catch {
    throw new Error(
      `Invalid signer policy bigint for ${fieldName}: ${rawValue}`,
    );
  }
}

function evaluateHyperliquidPolicy(
  request: Extract<
    SignerCommandRequest,
    { kind: "hyperliquid-sign-l1-action" }
  >,
  policy: HyperliquidSignerPolicy | undefined,
  reasons: string[],
): void {
  if (!policy) {
    return;
  }

  const actionType = String(
    request.request.action.type ?? "unknown",
  ).toLowerCase();
  const allowedActions = normalizeList(policy.allowActions);
  if (allowedActions.size > 0 && !allowedActions.has(actionType)) {
    reasons.push(
      `Hyperliquid action "${actionType}" is not allowed by signer policy`,
    );
  }

  const symbol = request.request.context?.symbol?.trim().toUpperCase();
  const allowedSymbols = new Set(
    (policy.allowSymbols ?? []).map((value) => value.trim().toUpperCase()),
  );
  if (allowedSymbols.size > 0 && (!symbol || !allowedSymbols.has(symbol))) {
    reasons.push(
      `Hyperliquid symbol "${symbol ?? "unknown"}" is not allowed by signer policy`,
    );
  }

  if (
    policy.maxLeverage !== undefined &&
    request.request.context?.leverage !== undefined &&
    request.request.context.leverage > policy.maxLeverage
  ) {
    reasons.push(
      `Hyperliquid leverage ${request.request.context.leverage} exceeds policy maximum ${policy.maxLeverage}`,
    );
  }

  if (
    policy.maxOrderSizeUsd !== undefined &&
    request.request.context?.sizeUsd !== undefined &&
    request.request.context.sizeUsd > policy.maxOrderSizeUsd
  ) {
    reasons.push(
      `Hyperliquid order size ${request.request.context.sizeUsd} exceeds policy maximum ${policy.maxOrderSizeUsd}`,
    );
  }
}

export function getWalletSignerPolicy(
  config: WoooConfig,
  walletName: string,
): WalletSignerPolicy | null {
  return config.signerPolicy?.[walletName] ?? null;
}

export function evaluateSignerPolicy(
  request: SignerCommandRequest,
  policy: WalletSignerPolicy | null,
  now = new Date(),
): SignerPolicyDecision {
  if (!policy) {
    return {
      allowed: true,
      autoApprove: false,
      reasons: [],
    };
  }

  const reasons: string[] = [];

  if (policy.expiresAt) {
    const expiresAt = new Date(policy.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) {
      reasons.push(
        `Invalid signer policy expiresAt value: ${policy.expiresAt}`,
      );
    } else if (now.getTime() > expiresAt.getTime()) {
      reasons.push(`Signer policy expired at ${policy.expiresAt}`);
    }
  }

  const allowedProtocols = normalizeList(policy.allowProtocols);
  if (allowedProtocols.size > 0) {
    const protocol = request.origin?.protocol?.trim().toLowerCase();
    if (!protocol || !allowedProtocols.has(protocol)) {
      reasons.push(
        `Protocol "${request.origin?.protocol ?? "unknown"}" is not allowed by signer policy`,
      );
    }
  }

  const allowedCommands = normalizeList(policy.allowCommands);
  if (allowedCommands.size > 0) {
    const command = request.origin?.command?.trim().toLowerCase();
    if (!command || !allowedCommands.has(command)) {
      reasons.push(
        `Command "${request.origin?.command ?? "unknown"}" is not allowed by signer policy`,
      );
    }
  }

  if (request.kind === "evm-write-contract") {
    const evmPolicy = policy.evm;
    if (evmPolicy) {
      const allowedChains = normalizeList(evmPolicy.allowChains);
      if (
        allowedChains.size > 0 &&
        !allowedChains.has(request.chainName.trim().toLowerCase())
      ) {
        reasons.push(
          `Chain "${request.chainName}" is not allowed by signer policy`,
        );
      }

      const allowedContracts = normalizeList(evmPolicy.allowContracts);
      if (
        allowedContracts.size > 0 &&
        !allowedContracts.has(request.contract.address.toLowerCase())
      ) {
        reasons.push(
          `Contract "${request.contract.address}" is not allowed by signer policy`,
        );
      }

      const functionName = request.contract.functionName.trim().toLowerCase();
      const allowedFunctions = normalizeList(evmPolicy.allowFunctions);
      if (allowedFunctions.size > 0 && !allowedFunctions.has(functionName)) {
        reasons.push(
          `Function "${request.contract.functionName}" is not allowed by signer policy`,
        );
      }

      const deniedFunctions = normalizeList(evmPolicy.denyFunctions);
      if (deniedFunctions.has(functionName)) {
        reasons.push(
          `Function "${request.contract.functionName}" is denied by signer policy`,
        );
      }

      const maxNativeValueWei = parsePolicyBigInt(
        evmPolicy.maxNativeValueWei,
        "maxNativeValueWei",
      );
      if (
        maxNativeValueWei !== null &&
        (request.contract.value ?? 0n) > maxNativeValueWei
      ) {
        reasons.push(
          `Native value ${(request.contract.value ?? 0n).toString()} exceeds policy maximum ${maxNativeValueWei.toString()}`,
        );
      }

      if (request.approval) {
        const approvalPolicy = evmPolicy.approvals;
        if (approvalPolicy?.allow === false) {
          reasons.push("Token approvals are denied by signer policy");
        }

        if (
          approvalPolicy?.denyUnlimited &&
          request.approval.amount === maxUint256
        ) {
          reasons.push("Unlimited token approvals are denied by signer policy");
        }

        const maxApprovalAmount = parsePolicyBigInt(
          approvalPolicy?.maxAmount,
          "approvals.maxAmount",
        );
        if (
          maxApprovalAmount !== null &&
          request.approval.amount > maxApprovalAmount
        ) {
          reasons.push(
            `Approval amount ${request.approval.amount.toString()} exceeds policy maximum ${maxApprovalAmount.toString()}`,
          );
        }

        const allowedSpenders = normalizeList(approvalPolicy?.allowSpenders);
        if (
          allowedSpenders.size > 0 &&
          !allowedSpenders.has(request.approval.spender.toLowerCase())
        ) {
          reasons.push(
            `Approval spender "${request.approval.spender}" is not allowed by signer policy`,
          );
        }

        const allowedTokens = normalizeList(approvalPolicy?.allowTokens);
        if (
          allowedTokens.size > 0 &&
          !allowedTokens.has(request.approval.token.toLowerCase())
        ) {
          reasons.push(
            `Approval token "${request.approval.token}" is not allowed by signer policy`,
          );
        }
      }
    }
  } else if (request.kind === "solana-send-versioned-transaction") {
    const allowedNetworks = normalizeList(policy.solana?.allowNetworks);
    if (
      allowedNetworks.size > 0 &&
      !allowedNetworks.has(request.network.trim().toLowerCase())
    ) {
      reasons.push(
        `Solana network "${request.network}" is not allowed by signer policy`,
      );
    }
  } else {
    evaluateHyperliquidPolicy(request, policy.hyperliquid, reasons);
  }

  const allowed = reasons.length === 0;
  return {
    allowed,
    autoApprove: allowed && policy.autoApprove === true,
    reasons,
  };
}
