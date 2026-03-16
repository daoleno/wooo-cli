import ccxt from "ccxt";
import { loadWoooConfigSync } from "./config";
import { getWalletClient } from "./evm";
import { appendSignerAudit } from "./signer-audit";
import { evaluateSignerPolicy, getWalletSignerPolicy } from "./signer-policy";
import type {
  HyperliquidSignCommandRequest,
  SignerCommandRequest,
  SignerCommandResponse,
  SignerPromptValue,
} from "./signer-protocol";
import { getSolanaConnection, getSolanaKeypair } from "./solana";

type SignerPromptDetails = Record<string, SignerPromptValue>;

export async function confirmSignerRequest(
  action: string,
  details: SignerPromptDetails = {},
): Promise<void> {
  if (!process.stdin.isTTY) {
    throw new Error(
      "Signer requires interactive confirmation. Set WOOO_SIGNER_AUTO_APPROVE=1 only in tests.",
    );
  }

  const clack = await import("@clack/prompts");
  const lines = [
    action,
    ...Object.entries(details).map(([key, value]) => `  ${key}: ${value}`),
  ];
  console.error(lines.join("\n"));

  const confirmed = await clack.confirm({
    message: "Authorize this signer request?",
  });

  if (clack.isCancel(confirmed) || !confirmed) {
    throw new Error("Signer request rejected");
  }
}

export function createSignerPrompt(request: SignerCommandRequest): {
  action: string;
  details: SignerPromptDetails;
} {
  if (request.kind === "evm-write-contract") {
    return {
      action:
        request.prompt?.action ||
        `Authorize EVM contract write for ${request.wallet.name}`,
      details: {
        wallet: request.wallet.name,
        protocol: request.origin?.protocol ?? "unknown",
        command: request.origin?.command ?? "unknown",
        chain: request.chainName,
        contract: request.contract.address,
        function: request.contract.functionName,
        value: request.contract.value?.toString() ?? "0",
        ...(request.approval
          ? {
              approvalToken: request.approval.token,
              approvalSpender: request.approval.spender,
              approvalAmount: request.approval.amount.toString(),
            }
          : {}),
        ...(request.prompt?.details ?? {}),
      },
    };
  }

  if (request.kind === "solana-send-versioned-transaction") {
    return {
      action:
        request.prompt?.action ||
        `Authorize Solana transaction for ${request.wallet.name}`,
      details: {
        wallet: request.wallet.name,
        protocol: request.origin?.protocol ?? "unknown",
        command: request.origin?.command ?? "unknown",
        network: request.network,
        ...(request.prompt?.details ?? {}),
      },
    };
  }

  const hyperliquidRequest = request as HyperliquidSignCommandRequest;
  return {
    action:
      hyperliquidRequest.request.prompt?.action ||
      `Authorize Hyperliquid action for ${request.wallet.name}`,
    details: {
      wallet: request.wallet.name,
      protocol: request.origin?.protocol ?? "unknown",
      command: request.origin?.command ?? "unknown",
      actionType: String(hyperliquidRequest.request.action.type ?? "unknown"),
      ...(hyperliquidRequest.request.context?.symbol
        ? { symbol: hyperliquidRequest.request.context.symbol }
        : {}),
      ...(hyperliquidRequest.request.context?.leverage !== undefined
        ? { leverage: hyperliquidRequest.request.context.leverage }
        : {}),
      ...(hyperliquidRequest.request.context?.side
        ? { side: hyperliquidRequest.request.context.side }
        : {}),
      ...(hyperliquidRequest.request.context?.sizeUsd !== undefined
        ? { sizeUsd: hyperliquidRequest.request.context.sizeUsd }
        : {}),
      ...(hyperliquidRequest.request.prompt?.details ?? {}),
    },
  };
}

export async function authorizeSignerRequest(
  request: SignerCommandRequest,
): Promise<boolean> {
  const config = loadWoooConfigSync();
  const policy = getWalletSignerPolicy(config, request.wallet.name);
  const decision = evaluateSignerPolicy(request, policy);
  if (!decision.allowed) {
    throw new Error(decision.reasons.join("; "));
  }

  if (process.env.WOOO_SIGNER_AUTO_APPROVE === "1") {
    return true;
  }

  if (decision.autoApprove) {
    return true;
  }

  const prompt = createSignerPrompt(request);
  await confirmSignerRequest(prompt.action, prompt.details);
  return false;
}

export async function executeSignerRequest(
  request: SignerCommandRequest,
  secret: string,
): Promise<SignerCommandResponse> {
  if (request.kind === "evm-write-contract") {
    const walletClient = getWalletClient(secret, request.chainName);
    const txHash = await walletClient.writeContract({
      ...request.contract,
      account: walletClient.account,
      chain: undefined,
    } as never);
    return { ok: true, txHash };
  }

  if (request.kind === "solana-send-versioned-transaction") {
    const connection = getSolanaConnection(request.network);
    const keypair = getSolanaKeypair(secret);
    const txBuf = Buffer.from(request.serializedTransactionBase64, "base64");
    const { VersionedTransaction } = await import("@solana/web3.js");
    const transaction = VersionedTransaction.deserialize(txBuf);
    transaction.sign([keypair]);
    const txHash = await connection.sendRawTransaction(
      transaction.serialize(),
      {
        skipPreflight: false,
        maxRetries: 2,
      },
    );
    return { ok: true, txHash };
  }

  const exchange = new ccxt.hyperliquid({
    privateKey: secret,
    walletAddress: request.wallet.address,
  });
  if (request.request.sandbox) {
    exchange.setSandboxMode(true);
  }
  const signature = exchange.signL1Action(
    request.request.action,
    request.request.nonce,
    request.request.vaultAddress,
    request.request.expiresAfter,
  ) as {
    r: `0x${string}`;
    s: `0x${string}`;
    v: number;
  };
  return { ok: true, signature };
}

export function recordSignerAudit(
  request: SignerCommandRequest,
  status: "approved" | "rejected",
  autoApproved: boolean,
  error?: string,
): void {
  try {
    appendSignerAudit(request, status, autoApproved, error);
  } catch {
    // Audit logging must not block signing.
  }
}
