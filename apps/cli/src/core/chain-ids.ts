/**
 * CAIP-2 chain ID resolution and chain family utilities.
 *
 * This module is the canonical source of chain identity for wooo-cli.
 * It maps human-friendly chain names/aliases to CAIP-2 chain IDs
 * (e.g. "base" → "eip155:8453") and provides helpers used by protocol
 * code and CLI arg descriptors.
 *
 * The old src/core/chains.ts exports are re-exported here for backward
 * compatibility while the codebase migrates.
 */

// CAIP-2 chain aliases: canonical name → CAIP-2 reference
export const CHAIN_ALIASES: Record<string, string> = {
  ethereum: "eip155:1",
  arbitrum: "eip155:42161",
  optimism: "eip155:10",
  polygon: "eip155:137",
  base: "eip155:8453",
  bsc: "eip155:56",
  avalanche: "eip155:43114",
  tempo: "eip155:698",
  solana: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  "solana-devnet": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
};

// Short alias → canonical name (must match old chains.ts)
const NAME_ALIASES: Record<string, string> = {
  eth: "ethereum",
  mainnet: "ethereum",
  arb: "arbitrum",
  op: "optimism",
  poly: "polygon",
  matic: "polygon",
  sol: "solana",
};

const CHAIN_ALIAS_LABELS: Partial<Record<string, string[]>> = {
  arbitrum: ["arb"],
  ethereum: ["eth"],
  optimism: ["op"],
  polygon: ["matic"],
  solana: ["sol"],
};

export type ChainFamily = "evm" | "solana";

/**
 * Normalize a chain name or short alias to its canonical long name.
 * e.g. "eth" → "ethereum", "arb" → "arbitrum", "sol" → "solana"
 * Unknown inputs are returned lowercased and trimmed unchanged.
 */
export function normalizeChainName(input: string): string {
  const normalized = input.trim().toLowerCase();
  return NAME_ALIASES[normalized] ?? normalized;
}

/**
 * Format a list of supported chain names for human-readable display,
 * appending known short aliases in parentheses.
 * e.g. ["ethereum", "base"] → "ethereum (eth), base"
 */
export function formatSupportedChains(supported: string[]): string {
  return supported
    .map((chain) => {
      const aliases = CHAIN_ALIAS_LABELS[chain];
      if (!aliases?.length) return chain;
      return `${chain} (${aliases.join(", ")})`;
    })
    .join(", ");
}

/**
 * Resolve a chain input (alias, canonical name, or already-valid CAIP-2 ID)
 * to a CAIP-2 chain ID string.
 *
 * Examples:
 *   resolveChainId("base")          → "eip155:8453"
 *   resolveChainId("eth")           → "eip155:1"
 *   resolveChainId("eip155:42161")  → "eip155:42161"
 *
 * Throws if the input cannot be resolved.
 */
export function resolveChainId(input: string): string {
  if (!input) {
    throw new Error(`Unknown or unsupported chain: "${input}"`);
  }

  // Already a CAIP-2 reference (contains ":")
  if (input.includes(":")) {
    return input;
  }

  // Normalize alias → canonical name, then look up CAIP-2
  const canonical = normalizeChainName(input);
  const caip2 = CHAIN_ALIASES[canonical];
  if (!caip2) {
    throw new Error(
      `Unknown or unsupported chain: "${input}". Supported chains: ${Object.keys(CHAIN_ALIASES).join(", ")}`,
    );
  }
  return caip2;
}

/**
 * Determine the chain family from a CAIP-2 chain ID.
 *
 * Examples:
 *   getChainFamily("eip155:1")                              → "evm"
 *   getChainFamily("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp") → "solana"
 *
 * Throws if the namespace is unsupported or the input is malformed.
 */
export function getChainFamily(chainId: string): ChainFamily {
  const colonIndex = chainId.indexOf(":");
  if (colonIndex === -1) {
    throw new Error(
      `Malformed CAIP-2 chain ID: "${chainId}" (expected "namespace:reference")`,
    );
  }
  const namespace = chainId.slice(0, colonIndex);
  if (namespace === "eip155") return "evm";
  if (namespace === "solana") return "solana";
  throw new Error(
    `Unsupported chain namespace: "${namespace}" in chain ID "${chainId}"`,
  );
}

/**
 * Return the canonical chain name for a CAIP-2 chain ID.
 * Falls back to the chain ID itself when no mapping is found.
 */
export function getChainName(chainId: string): string {
  for (const [name, id] of Object.entries(CHAIN_ALIASES)) {
    if (id === chainId) return name;
  }
  return chainId;
}

/** Return true when the given chain name/alias resolves to an EVM chain. */
export function isEvmChain(name: string): boolean {
  try {
    return getChainFamily(resolveChainId(name)) === "evm";
  } catch {
    return false;
  }
}

/** Return true when the given chain name/alias resolves to a Solana chain. */
export function isSolanaChain(name: string): boolean {
  try {
    return getChainFamily(resolveChainId(name)) === "solana";
  } catch {
    return false;
  }
}

/**
 * Citty arg descriptor for an EVM chain argument.
 * Accepts the same aliases as resolveChainId().
 */
export function evmChainArg(defaultChain = "ethereum") {
  return {
    type: "string" as const,
    description: EVM_CHAIN_HELP_TEXT_WITH_DEFAULT,
    default: defaultChain,
  };
}

// ---------------------------------------------------------------------------
// Help-text constants (backward compat with chains.ts)
// ---------------------------------------------------------------------------

export const EVM_CHAIN_HELP_TEXT =
  "EVM chain, e.g. ethereum|eth, arbitrum|arb, optimism|op, polygon|matic, base, tempo";

export const EVM_CHAIN_HELP_TEXT_WITH_DEFAULT =
  "EVM chain, e.g. ethereum|eth, arbitrum|arb, optimism|op, polygon|matic, base, tempo (default: ethereum)";

export const CHAIN_HELP_TEXT_WITH_CONFIG_DEFAULT =
  "Chain, e.g. ethereum|eth, arbitrum|arb, optimism|op, polygon|matic, base, solana|sol (default from config)";

export const EVM_OR_SOLANA_CHAIN_HELP_TEXT =
  "EVM chain or Solana network override, e.g. eth, arb, op, matic, base, sol";

export const SWAP_CHAIN_HELP_TEXT_WITH_DEFAULT =
  "Chain, e.g. ethereum|eth, arbitrum|arb, optimism|op, polygon|matic, base, solana|sol (default: ethereum)";
