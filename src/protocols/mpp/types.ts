export interface MppService {
  name: string;
  url: string;
  description?: string;
  pricing?: Record<string, string>;
}

export interface MppCallResult {
  status: number;
  url: string;
  paymentAmount?: string;
  receiptHash?: string;
  data: unknown;
}

export interface MppBalance {
  address: string;
  chain: string;
  nativeUSD: string;
  protocol: string;
}
