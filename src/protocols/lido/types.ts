export interface LidoStakeResult {
  txHash: string;
  amountETH: string;
  amountStETH: string;
  status: string;
}

export interface LidoRewards {
  stETHBalance: string;
  rewardsEarned: string;
  apr: string;
}
