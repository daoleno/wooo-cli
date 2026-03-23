import {
  type Address,
  type Chain,
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum, base, mainnet, optimism, polygon, tempo } from "viem/chains";
import { formatSupportedChains, normalizeChainName } from "./chains";
import { loadWoooConfigSync } from "./config";

export const CHAIN_MAP: Record<string, Chain> = {
  ethereum: mainnet,
  arbitrum: arbitrum,
  optimism: optimism,
  polygon: polygon,
  base: base,
  tempo: tempo,
};

export const EVM_RPC_TIMEOUT_MS = 8_000;
export const EVM_RPC_RETRY_COUNT = 0;
export const EVM_RPC_RETRY_DELAY_MS = 250;
export const EVM_LOCAL_RPC_TIMEOUT_MS = 30_000;

export function getChain(name: string): Chain {
  const canonicalName = normalizeChainName(name);
  const chain = CHAIN_MAP[canonicalName];
  if (!chain) {
    const supported = formatSupportedChains(Object.keys(CHAIN_MAP));
    console.error(`Unsupported chain: ${name}. Supported: ${supported}`);
    process.exit(2);
  }
  return chain;
}

export function getRpcUrlForChain(chainName: string): string | undefined {
  return loadWoooConfigSync().chains?.[normalizeChainName(chainName)]?.rpc;
}

function isLocalRpcUrl(rpcUrl: string | undefined): boolean {
  if (!rpcUrl) return false;

  try {
    const { hostname } = new URL(rpcUrl);
    return hostname === "127.0.0.1" || hostname === "localhost";
  } catch {
    return false;
  }
}

function createHttpTransport(chainName: string) {
  const rpcUrl = getRpcUrlForChain(chainName);
  const timeout = isLocalRpcUrl(rpcUrl)
    ? EVM_LOCAL_RPC_TIMEOUT_MS
    : EVM_RPC_TIMEOUT_MS;
  return http(rpcUrl, {
    retryCount: EVM_RPC_RETRY_COUNT,
    retryDelay: EVM_RPC_RETRY_DELAY_MS,
    timeout,
  });
}

export function getPublicClient(chainName: string): PublicClient {
  const chain = getChain(chainName);
  return createPublicClient({
    chain,
    transport: createHttpTransport(chainName),
  });
}

export function getWalletClient(
  privateKey: string,
  chainName: string,
): WalletClient {
  const chain = getChain(chainName);
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  return createWalletClient({
    account,
    chain,
    transport: createHttpTransport(chainName),
  });
}

export function getAccountAddress(privateKey: string): Address {
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  return account.address;
}
