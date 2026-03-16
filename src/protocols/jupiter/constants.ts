// Well-known Solana token mints
export const SOLANA_TOKENS: Record<string, { mint: string; decimals: number }> =
  {
    SOL: { mint: "So11111111111111111111111111111111111111112", decimals: 9 },
    USDC: { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6 },
    USDT: { mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", decimals: 6 },
    BONK: { mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", decimals: 5 },
    JTO: { mint: "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL", decimals: 9 },
    WIF: { mint: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", decimals: 6 },
    JUP: { mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", decimals: 6 },
    RAY: { mint: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R", decimals: 6 },
    PYTH: { mint: "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3", decimals: 6 },
  };

// Jupiter Lite API endpoint. The older quote-api.jup.ag endpoint has
// certificate issues in some environments.
export const JUPITER_API = "https://lite-api.jup.ag/swap/v1";

export function resolveTokenMint(
  symbol: string,
): { mint: string; decimals: number } | undefined {
  return SOLANA_TOKENS[symbol.toUpperCase()];
}
