import { createHmac } from "node:crypto";
import { loadWoooConfig } from "../../core/config";
import {
  getCredentialField,
  getCredentialService,
  requireCredentialField,
} from "../../core/credentials";
import {
  type BridgeTokenMetadata,
  findTokenMatch,
  getNativeTokenMetadata,
} from "../bridge/token-resolution";
import type { OkxBridgeQuote, OkxBridgeStatus } from "./types";

const BASE_URL = "https://web3.okx.com";

interface OkxApiAuth {
  apiKey: string;
  secretKey: string;
  passphrase: string;
  projectId: string;
}

interface SignatureParams extends OkxApiAuth {
  method: string;
  requestPath: string;
  queryString?: string;
}

export function createOkxSignatureHeaders(
  params: SignatureParams,
): Record<string, string> {
  const timestamp = new Date().toISOString();
  const preSign = `${timestamp}${params.method}${params.requestPath}${params.queryString ? `?${params.queryString}` : ""}`;
  const sign = createHmac("sha256", params.secretKey)
    .update(preSign)
    .digest("base64");
  return {
    "OK-ACCESS-KEY": params.apiKey,
    "OK-ACCESS-SIGN": sign,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": params.passphrase,
    "OK-ACCESS-PROJECT": params.projectId,
    "Content-Type": "application/json",
  };
}

async function resolveAuth(): Promise<OkxApiAuth> {
  const config = await loadWoooConfig();
  const credentials = getCredentialService("okx-onchain");
  const projectId = config.okxOnchain?.projectId;
  if (typeof projectId !== "string" || !projectId.trim()) {
    throw new Error(
      "OKX Bridge requires an OKX Onchain project ID. Run `wooo-cli auth set okx-onchain --project-id <id>` or set config okxOnchain.projectId.",
    );
  }
  return {
    apiKey: (
      await requireCredentialField({
        config,
        field: getCredentialField(credentials, "apiKey"),
        service: credentials,
      })
    ).reveal(),
    secretKey: (
      await requireCredentialField({
        config,
        field: getCredentialField(credentials, "secret"),
        service: credentials,
      })
    ).reveal(),
    passphrase: (
      await requireCredentialField({
        config,
        field: getCredentialField(credentials, "passphrase"),
        service: credentials,
      })
    ).reveal(),
    projectId: projectId.trim(),
  };
}

export class OkxBridgeClient {
  private auth: OkxApiAuth | undefined;

  constructor(auth?: OkxApiAuth) {
    this.auth = auth;
  }

  private async request<T>(
    method: string,
    path: string,
    params?: Record<string, string>,
  ): Promise<T> {
    this.auth ??= await resolveAuth();
    const queryString = params ? new URLSearchParams(params).toString() : "";
    const headers = createOkxSignatureHeaders({
      ...this.auth,
      method,
      requestPath: path,
      queryString: queryString || undefined,
    });
    const url = `${BASE_URL}${path}${queryString ? `?${queryString}` : ""}`;
    const response = await fetch(url, { method, headers });
    if (!response.ok) {
      throw new Error(
        `OKX API error: ${response.status} ${response.statusText}`,
      );
    }
    const json = (await response.json()) as {
      code: string;
      msg: string;
      data: T;
    };
    if (json.code !== "0") {
      throw new Error(`OKX API error: ${json.msg} (code: ${json.code})`);
    }
    return json.data;
  }

  async getQuote(params: {
    fromChainId: string;
    toChainId: string;
    fromTokenAddress: string;
    toTokenAddress: string;
    amount: string;
    slippage?: string;
    userWalletAddress: string;
  }): Promise<OkxBridgeQuote> {
    const data = await this.request<any[]>(
      "GET",
      "/api/v5/dex/cross-chain/quote",
      {
        fromChainId: params.fromChainId,
        toChainId: params.toChainId,
        fromTokenAddress: params.fromTokenAddress,
        toTokenAddress: params.toTokenAddress,
        amount: params.amount,
        slippage: params.slippage ?? "0.005",
        userWalletAddress: params.userWalletAddress,
      },
    );
    const route = data[0];
    return {
      fromChainId: route.fromChainId,
      toChainId: route.toChainId,
      fromToken: {
        symbol: route.fromToken.tokenSymbol,
        address: route.fromToken.tokenContractAddress,
        decimals: Number(route.fromToken.decimal),
      },
      toToken: {
        symbol: route.toToken.tokenSymbol,
        address: route.toToken.tokenContractAddress,
        decimals: Number(route.toToken.decimal),
      },
      fromAmount: route.fromTokenAmount,
      toAmount: route.toTokenAmount,
      bridgeName: route.bridgeName ?? "okx",
      estimatedGas: route.estimatedGas ?? "0",
      tx: {
        to: route.tx.to,
        data: route.tx.data,
        value: route.tx.value ?? "0",
        gasPrice: route.tx.gasPrice,
      },
      needApproval: route.needApprove === "true" || route.needApprove === true,
      approveTo: route.approveTo,
    };
  }

  async getApproveData(params: {
    chainId: string;
    tokenAddress: string;
    amount: string;
    approveAddress: string;
  }): Promise<{ to: string; data: string }> {
    const data = await this.request<any[]>(
      "GET",
      "/api/v5/dex/cross-chain/approve-transaction",
      {
        chainId: params.chainId,
        tokenContractAddress: params.tokenAddress,
        approveAmount: params.amount,
      },
    );
    return { to: data[0].to, data: data[0].data };
  }

  async getStatus(txHash: string): Promise<OkxBridgeStatus> {
    const data = await this.request<any[]>(
      "GET",
      "/api/v5/dex/cross-chain/status",
      { hash: txHash },
    );
    const result = data[0];
    return {
      status: result.status,
      fromChainId: result.fromChainId,
      toChainId: result.toChainId,
      txHash,
      bridgeName: result.bridgeName ?? "okx",
      sourceChainGasfee: result.sourceChainGasfee,
      destinationChainGasfee: result.destinationChainGasfee,
      crossChainFee: result.crossChainFee,
    };
  }

  async getSupportedChains(): Promise<
    Array<{ chainId: string; chainName: string }>
  > {
    const data = await this.request<any[]>(
      "GET",
      "/api/v5/dex/cross-chain/supported/chains",
      {},
    );
    return data.map((c: any) => ({
      chainId: c.chainId,
      chainName: c.chainName,
    }));
  }

  async getSupportedTokens(
    chainId?: string,
  ): Promise<Array<BridgeTokenMetadata & { chainId: string }>> {
    const params: Record<string, string> = {};
    if (chainId) params.chainId = chainId;
    const data = await this.request<any[]>(
      "GET",
      "/api/v5/dex/cross-chain/supported/tokens",
      params,
    );
    return data.map((t: any) => ({
      symbol: t.tokenSymbol,
      address: t.tokenContractAddress,
      decimals: Number(t.decimal),
      chainId: t.chainId,
    }));
  }

  async resolveToken(
    chain: string,
    chainId: string,
    token: string,
  ): Promise<BridgeTokenMetadata> {
    const nativeToken = getNativeTokenMetadata(chain, token);
    if (nativeToken) return nativeToken;

    const supportedTokens = await this.getSupportedTokens(chainId);
    const resolved = findTokenMatch(
      supportedTokens.filter(
        (supportedToken) => supportedToken.chainId === chainId,
      ),
      token,
    );
    if (!resolved) {
      throw new Error(`Unsupported token ${token} on ${chain}`);
    }
    return resolved;
  }
}
