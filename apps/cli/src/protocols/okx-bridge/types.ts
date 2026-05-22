export interface OkxBridgeToken {
  symbol: string;
  address: string;
  decimals: number;
}

export interface OkxBridgeTx {
  to: string;
  data: string;
  value: string;
  gasPrice?: string;
}

export interface OkxBridgeQuote {
  fromChainId: string;
  toChainId: string;
  fromToken: OkxBridgeToken;
  toToken: OkxBridgeToken;
  fromAmount: string;
  toAmount: string;
  bridgeName: string;
  estimatedGas: string;
  tx: OkxBridgeTx;
  needApproval?: boolean;
  approveTo?: string;
}

export type OkxBridgeStatusValue = "PENDING" | "SUCCESS" | "FAIL" | "REFUNDED";

export interface OkxBridgeStatus {
  status: OkxBridgeStatusValue;
  fromChainId: string;
  toChainId: string;
  txHash: string;
  bridgeName: string;
  sourceChainGasfee?: string;
  destinationChainGasfee?: string;
  crossChainFee?: string;
}

export interface OkxBridgeResult {
  approvalTxHash?: string;
  txHash: string;
  fromChainId: string;
  toChainId: string;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  estimatedToAmount: string;
}
