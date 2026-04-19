interface AaveBorrowableMarketLike {
  active: boolean;
  borrowingEnabled: boolean;
  frozen: boolean;
  token: string;
}

type AaveBorrowProfile = "fork" | "remote-signer";

interface AaveBorrowPlan {
  borrowAmount: string;
  repayAmount: string;
  token: string;
}

const ETHEREUM_AAVE_BORROW_CANDIDATES: Array<{
  fork: { borrowAmount: string; repayAmount: string };
  "remote-signer": { borrowAmount: string; repayAmount: string };
  token: string;
}> = [
  {
    token: "DAI",
    fork: { borrowAmount: "10", repayAmount: "5" },
    "remote-signer": { borrowAmount: "5", repayAmount: "5" },
  },
  {
    token: "GHO",
    fork: { borrowAmount: "10", repayAmount: "5" },
    "remote-signer": { borrowAmount: "5", repayAmount: "5" },
  },
  {
    token: "PYUSD",
    fork: { borrowAmount: "10", repayAmount: "5" },
    "remote-signer": { borrowAmount: "5", repayAmount: "5" },
  },
  {
    token: "USDC",
    fork: { borrowAmount: "10", repayAmount: "5" },
    "remote-signer": { borrowAmount: "5", repayAmount: "5" },
  },
];

export function selectEthereumAaveBorrowPlan(
  markets: AaveBorrowableMarketLike[],
  profile: AaveBorrowProfile,
): AaveBorrowPlan {
  const availableMarkets = new Map(
    markets.map((market) => [market.token.toUpperCase(), market]),
  );

  for (const candidate of ETHEREUM_AAVE_BORROW_CANDIDATES) {
    const market = availableMarkets.get(candidate.token);
    if (!market) {
      continue;
    }

    if (market.active && market.borrowingEnabled && !market.frozen) {
      return {
        token: candidate.token,
        ...candidate[profile],
      };
    }
  }

  const borrowableMarkets = markets
    .filter(
      (market) => market.active && market.borrowingEnabled && !market.frozen,
    )
    .map((market) => market.token)
    .sort();

  throw new Error(
    borrowableMarkets.length > 0
      ? `No supported Ethereum Aave borrow reserve is available for tests. Borrowable reserves: ${borrowableMarkets.join(", ")}`
      : "No active, unfrozen Ethereum Aave borrow reserves are currently available for tests.",
  );
}
