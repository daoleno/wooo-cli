const CHAIN_ALIAS_MAP = {
  arb: "arbitrum",
  eth: "ethereum",
  mainnet: "ethereum",
  matic: "polygon",
  op: "optimism",
  poly: "polygon",
  sol: "solana",
} as const satisfies Record<string, string>;

const CHAIN_ALIAS_LABELS: Partial<Record<string, string[]>> = {
  arbitrum: ["arb"],
  ethereum: ["eth"],
  optimism: ["op"],
  polygon: ["matic"],
  solana: ["sol"],
};

export function normalizeChainName(value: string): string {
  const normalized = value.trim().toLowerCase();
  return (
    CHAIN_ALIAS_MAP[normalized as keyof typeof CHAIN_ALIAS_MAP] ?? normalized
  );
}

export function formatSupportedChains(supported: string[]): string {
  return supported
    .map((chain) => {
      const aliases = CHAIN_ALIAS_LABELS[chain];
      if (!aliases?.length) return chain;
      return `${chain} (${aliases.join(", ")})`;
    })
    .join(", ");
}

export const EVM_CHAIN_HELP_TEXT =
  "EVM chain, e.g. ethereum|eth, arbitrum|arb, optimism|op, polygon|matic, base";

export const EVM_CHAIN_HELP_TEXT_WITH_DEFAULT =
  "EVM chain, e.g. ethereum|eth, arbitrum|arb, optimism|op, polygon|matic, base (default: ethereum)";

export const CHAIN_HELP_TEXT_WITH_CONFIG_DEFAULT =
  "Chain, e.g. ethereum|eth, arbitrum|arb, optimism|op, polygon|matic, base, solana|sol (default from config)";

export const EVM_OR_SOLANA_CHAIN_HELP_TEXT =
  "EVM chain or Solana network override, e.g. eth, arb, op, matic, base, sol";

export const SWAP_CHAIN_HELP_TEXT_WITH_DEFAULT =
  "Chain, e.g. ethereum|eth, arbitrum|arb, optimism|op, polygon|matic, base, solana|sol (default: ethereum)";

export function evmChainArg(defaultChain = "ethereum") {
  return {
    type: "string" as const,
    description: EVM_CHAIN_HELP_TEXT_WITH_DEFAULT,
    default: defaultChain,
  };
}
