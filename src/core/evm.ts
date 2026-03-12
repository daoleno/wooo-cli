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
import { arbitrum, base, mainnet, optimism, polygon } from "viem/chains";

export const CHAIN_MAP: Record<string, Chain> = {
  ethereum: mainnet,
  arbitrum: arbitrum,
  optimism: optimism,
  polygon: polygon,
  base: base,
};

export function getChain(name: string): Chain {
  const chain = CHAIN_MAP[name];
  if (!chain) {
    const supported = Object.keys(CHAIN_MAP).join(", ");
    console.error(`Unsupported chain: ${name}. Supported: ${supported}`);
    process.exit(2);
  }
  return chain;
}

export function getPublicClient(chainName: string): PublicClient {
  const chain = getChain(chainName);
  return createPublicClient({ chain, transport: http() });
}

export function getWalletClient(
  privateKey: string,
  chainName: string,
): WalletClient {
  const chain = getChain(chainName);
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  return createWalletClient({ account, chain, transport: http() });
}

export function getAccountAddress(privateKey: string): Address {
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  return account.address;
}
