import { getAddress, isAddress, parseUnits } from "viem";

export const EVM_NATIVE_TOKEN_ADDRESS =
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

interface NativeTokenConfig {
  decimals: number;
  symbols: string[];
}

const NATIVE_TOKEN_BY_CHAIN: Record<string, NativeTokenConfig> = {
  ethereum: { decimals: 18, symbols: ["ETH"] },
  arbitrum: { decimals: 18, symbols: ["ETH"] },
  optimism: { decimals: 18, symbols: ["ETH"] },
  base: { decimals: 18, symbols: ["ETH"] },
  polygon: { decimals: 18, symbols: ["MATIC", "POL"] },
  bsc: { decimals: 18, symbols: ["BNB"] },
  avalanche: { decimals: 18, symbols: ["AVAX"] },
  tempo: { decimals: 18, symbols: ["TEMPO"] },
};

export interface BridgeTokenMetadata {
  address: string;
  decimals: number;
  symbol: string;
}

export function normalizeBridgeTokenInput(value: string): string {
  const trimmed = value.trim();
  return isAddress(trimmed) ? getAddress(trimmed) : trimmed.toUpperCase();
}

export function getNativeTokenMetadata(
  chain: string,
  token: string,
): BridgeTokenMetadata | undefined {
  const native = NATIVE_TOKEN_BY_CHAIN[chain];
  if (!native) return;

  const normalized = normalizeBridgeTokenInput(token);
  if (!native.symbols.includes(normalized)) return;

  return {
    address: EVM_NATIVE_TOKEN_ADDRESS,
    decimals: native.decimals,
    symbol: native.symbols[0],
  };
}

export function toBaseUnits(amount: number, decimals: number): string {
  return parseUnits(String(amount), decimals).toString();
}

export function findTokenMatch(
  tokens: BridgeTokenMetadata[],
  input: string,
): BridgeTokenMetadata | undefined {
  const normalized = normalizeBridgeTokenInput(input);

  if (isAddress(normalized)) {
    return tokens.find(
      (token) => token.address.toLowerCase() === normalized.toLowerCase(),
    );
  }

  const matches = tokens.filter(
    (token) => token.symbol.toUpperCase() === normalized,
  );
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) return;

  const uniqueAddresses = new Set(
    matches.map((token) => token.address.toLowerCase()),
  );
  if (uniqueAddresses.size === 1) return matches[0];

  throw new Error(
    `Token symbol ${normalized} is ambiguous. Please provide the token contract address instead.`,
  );
}
