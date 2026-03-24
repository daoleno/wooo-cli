import ccxt from "ccxt";
import type {
  HyperliquidActionSignature,
  HyperliquidActionSigningRequest,
} from "./signer-protocol";

const HYPERLIQUID_ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const HYPERLIQUID_L1_CHAIN_ID = 1337;

interface HyperliquidSigningExchange {
  actionHash(
    action: Record<string, unknown>,
    vaultAddress: string | undefined,
    nonce: number,
    expiresAfter?: number,
  ): string | Uint8Array;
  constructPhantomAgent(
    hash: string | Uint8Array,
    isTestnet?: boolean,
  ): {
    connectionId: string | Uint8Array;
    source: string;
  };
  options: {
    sandboxMode?: boolean;
  };
  privateKey: string;
  signL1Action(
    action: Record<string, unknown>,
    nonce: number,
    vaultAddress?: string,
    expiresAfter?: number,
  ): HyperliquidActionSignature;
}

function normalizeVaultAddress(address?: string): string | undefined {
  if (!address) {
    return undefined;
  }

  return address.startsWith("0x") ? address.slice(2) : address;
}

function toBytes32Hex(value: string | Uint8Array): `0x${string}` {
  if (typeof value === "string") {
    return (value.startsWith("0x") ? value : `0x${value}`) as `0x${string}`;
  }

  return `0x${Buffer.from(value).toString("hex")}`;
}

function createExchange(): HyperliquidSigningExchange {
  return new ccxt.hyperliquid() as unknown as HyperliquidSigningExchange;
}

export function createHyperliquidL1TypedData(
  request: HyperliquidActionSigningRequest,
): {
  domain: Record<string, unknown>;
  message: Record<string, unknown>;
  primaryType: "Agent";
  types: Record<string, Array<{ name: string; type: string }>>;
} {
  const exchange = createExchange();
  const connectionId = exchange.actionHash(
    request.action,
    normalizeVaultAddress(request.vaultAddress),
    request.nonce,
    request.expiresAfter,
  );
  const phantomAgent = exchange.constructPhantomAgent(
    connectionId,
    Boolean(request.sandbox),
  );

  return {
    domain: {
      chainId: HYPERLIQUID_L1_CHAIN_ID,
      name: "Exchange",
      verifyingContract: HYPERLIQUID_ZERO_ADDRESS,
      version: "1",
    },
    types: {
      Agent: [
        { name: "source", type: "string" },
        { name: "connectionId", type: "bytes32" },
      ],
    },
    primaryType: "Agent",
    message: {
      ...phantomAgent,
      connectionId: toBytes32Hex(phantomAgent.connectionId),
    },
  };
}

export function signHyperliquidL1Action(
  privateKey: string,
  request: HyperliquidActionSigningRequest,
): HyperliquidActionSignature {
  const exchange = createExchange();
  exchange.privateKey = privateKey;
  exchange.options = {
    ...exchange.options,
    sandboxMode: Boolean(request.sandbox),
  };

  return exchange.signL1Action(
    request.action,
    request.nonce,
    normalizeVaultAddress(request.vaultAddress),
    request.expiresAfter,
  );
}
