import { type Address, getAddress } from "viem";
import { getChain } from "../../core/evm";

const AAVE_GRAPHQL_API_URL = "https://api.v3.aave.com/graphql";
const AAVE_API_TIMEOUT_MS = 8_000;

export interface AaveApiReserve {
  underlyingToken: {
    symbol: string;
    address: Address;
    decimals: number;
  };
  supplyInfo: {
    apy: {
      formatted: string;
    };
    maxLTV: {
      formatted: string;
    };
    canBeCollateral: boolean;
  };
  borrowInfo: {
    apy: {
      formatted: string;
    };
    borrowingState: "ENABLED" | "DISABLED";
  } | null;
  isFrozen: boolean;
  isPaused: boolean;
}

export interface AaveApiMarket {
  name: string;
  address: Address;
  reserves: AaveApiReserve[];
}

interface GraphqlResponse<T> {
  data?: T;
  errors?: Array<{
    message?: string;
  }>;
}

interface AaveMarketsQueryResponse {
  markets: Array<{
    name: string;
    address: string;
    reserves: Array<{
      underlyingToken: {
        symbol: string;
        address: string;
        decimals: number;
      };
      supplyInfo: {
        apy: {
          formatted: string;
        };
        maxLTV: {
          formatted: string;
        };
        canBeCollateral: boolean;
      };
      borrowInfo: {
        apy: {
          formatted: string;
        };
        borrowingState: "ENABLED" | "DISABLED";
      } | null;
      isFrozen: boolean;
      isPaused: boolean;
    }>;
  }>;
}

const AAVE_MARKETS_QUERY = `
  query AaveMarkets($chainId: ChainId!) {
    markets(request: { chainIds: [$chainId] }) {
      name
      address
      reserves {
        underlyingToken {
          symbol
          address
          decimals
        }
        supplyInfo {
          apy {
            formatted
          }
          maxLTV {
            formatted
          }
          canBeCollateral
        }
        borrowInfo {
          apy {
            formatted
          }
          borrowingState
        }
        isFrozen
        isPaused
      }
    }
  }
`;

async function fetchAaveGraphql<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(AAVE_GRAPHQL_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(AAVE_API_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(
      `Aave API request failed with status ${response.status} ${response.statusText}`,
    );
  }

  const payload = (await response.json()) as GraphqlResponse<T>;
  if (payload.errors?.length) {
    const message =
      payload.errors.find((error) => error.message)?.message ??
      "Unknown Aave API error";
    throw new Error(`Aave API error: ${message}`);
  }
  if (!payload.data) {
    throw new Error("Aave API returned no data");
  }
  return payload.data;
}

export async function fetchAaveMarkets(
  chainName: string,
): Promise<AaveApiMarket[]> {
  const chainId = getChain(chainName).id;
  const data = await fetchAaveGraphql<AaveMarketsQueryResponse>(
    AAVE_MARKETS_QUERY,
    { chainId },
  );

  return data.markets.map((market) => ({
    name: market.name,
    address: getAddress(market.address),
    reserves: market.reserves.map((reserve) => ({
      underlyingToken: {
        symbol: reserve.underlyingToken.symbol,
        address: getAddress(reserve.underlyingToken.address),
        decimals: reserve.underlyingToken.decimals,
      },
      supplyInfo: reserve.supplyInfo,
      borrowInfo: reserve.borrowInfo,
      isFrozen: reserve.isFrozen,
      isPaused: reserve.isPaused,
    })),
  }));
}
