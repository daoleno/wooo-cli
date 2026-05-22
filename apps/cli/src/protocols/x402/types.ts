export interface X402CallResult {
  status: number;
  url: string;
  chain: string;
  data: unknown;
}

export interface X402Balance {
  address: string;
  chain: string;
  usdc: string;
  protocol: string;
}
