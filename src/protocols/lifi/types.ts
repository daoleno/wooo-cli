export interface LifiTransactionRequest {
  to: string;
  data: string;
  value: string;
  gasLimit: string;
  gasPrice?: string;
}

export interface LifiQuote {
  fromChain: string;
  toChain: string;
  fromTokenAddress: string;
  toTokenAddress: string;
  fromToken: string;
  toToken: string;
  fromTokenDecimals: number;
  toTokenDecimals: number;
  fromAmount: string;
  toAmount: string;
  bridgeName: string;
  fees: {
    total: string;
    gas: string;
    bridge: string;
  };
  estimatedTime: number;
  transactionRequest: LifiTransactionRequest;
  approvalAddress?: string;
}

export type LifiStatusValue = "PENDING" | "DONE" | "FAILED" | "NOT_FOUND";
export type LifiSubstatus = "COMPLETED" | "PARTIAL" | "REFUNDED" | null;

export interface LifiStatus {
  status: LifiStatusValue;
  substatus: LifiSubstatus;
  fromChain: string;
  toChain: string;
  txHash: string;
  bridgeName: string;
  toAmount?: string;
}

export interface LifiBridgeResult {
  approvalTxHash?: string;
  txHash: string;
  fromChain: string;
  toChain: string;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  estimatedToAmount: string;
}
