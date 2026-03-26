import { defineCommand } from "citty";
import { type Address, isAddress, maxUint256, parseUnits } from "viem";
import { evmChainArg } from "../../core/chain-ids";
import {
  createApprovalStep,
  createExecutionPlan,
} from "../../core/execution-plan";
import { getActiveWalletPort } from "../../core/context";
import { getChain, getPublicClient } from "../../core/evm";
import { TxGateway } from "../../core/tx-gateway";
import {
  runWriteOperation,
  type WriteOperation,
} from "../../core/write-operation";
import { validateAmount, validateChain } from "../../core/validation";
import {
  ERC20_ABI,
  NATIVE_WRAPS,
  resolveToken,
} from "../../protocols/uniswap/constants";

const SUPPORTED_CHAINS = [
  "ethereum",
  "arbitrum",
  "optimism",
  "polygon",
  "base",
];

const ERC20_APPROVAL_METADATA_ABI = [
  ...ERC20_ABI,
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

interface ApprovalAsset {
  address: Address;
  decimals: number;
  symbol: string;
}

interface PreparedChainApproval {
  amount: string;
  amountWei: bigint;
  asset: ApprovalAsset;
  chain: string;
  isMaxApproval: boolean;
  spender: Address;
}

interface ChainApprovalResult {
  amount: string;
  chain: string;
  owner: string;
  spender: string;
  status: "confirmed" | "failed";
  token: string;
  tokenAddress: string;
  txHash: string;
}

async function resolveApprovalAsset(
  chain: string,
  token: string,
): Promise<ApprovalAsset> {
  const normalizedToken = token.trim().toUpperCase();
  const nativeSymbol = getChain(chain).nativeCurrency.symbol.toUpperCase();
  if (normalizedToken === nativeSymbol) {
    const wrappedSymbol = NATIVE_WRAPS[normalizedToken];
    throw new Error(
      `Token "${normalizedToken}" is the native asset on ${chain} and cannot be approved. Use ${wrappedSymbol} explicitly if you meant the wrapped ERC-20.`,
    );
  }

  if (isAddress(token)) {
    const publicClient = getPublicClient(chain);
    const [decimals, symbol] = await Promise.all([
      publicClient.readContract({
        address: token,
        abi: ERC20_APPROVAL_METADATA_ABI,
        functionName: "decimals",
      }) as Promise<number>,
      publicClient.readContract({
        address: token,
        abi: ERC20_APPROVAL_METADATA_ABI,
        functionName: "symbol",
      }) as Promise<string>,
    ]);

    return {
      address: token,
      decimals,
      symbol,
    };
  }

  const resolved = resolveToken(token, chain);
  if (!resolved) {
    throw new Error(
      `Unknown token "${token}" on ${chain}. Provide a supported symbol or ERC-20 contract address.`,
    );
  }

  return {
    address: resolved.address,
    decimals: resolved.decimals,
    symbol: normalizedToken,
  };
}

function validateApprovalMode(
  amount: string | undefined,
  max: boolean | undefined,
): { amount: string; isMaxApproval: boolean } {
  const isMaxApproval = Boolean(max);

  if (isMaxApproval && amount) {
    console.error("Error: amount cannot be combined with --max");
    process.exit(1);
  }

  if (!isMaxApproval && !amount) {
    console.error("Error: amount is required unless --max is set");
    process.exit(1);
  }

  if (amount) {
    validateAmount(amount, "Approval amount");
  }

  return {
    amount: isMaxApproval ? "MAX" : (amount as string),
    isMaxApproval,
  };
}

function createChainApproveOperation(params: {
  amount: string;
  chain: string;
  isMaxApproval: boolean;
  spender: Address;
  token: string;
}): WriteOperation<
  PreparedChainApproval,
  Awaited<ReturnType<typeof getActiveWalletPort>>,
  ChainApprovalResult
> {
  return {
    protocol: "chain",
    prepare: async () => {
      const asset = await resolveApprovalAsset(params.chain, params.token);
      return {
        chain: params.chain,
        spender: params.spender,
        amount: params.amount,
        amountWei: params.isMaxApproval
          ? maxUint256
          : parseUnits(params.amount, asset.decimals),
        isMaxApproval: params.isMaxApproval,
        asset,
      };
    },
    createPreview: (prepared) => ({
      action: `Approve ${prepared.spender} to spend ${prepared.amount} ${prepared.asset.symbol} on ${prepared.chain}`,
      details: {
        chain: prepared.chain,
        token: prepared.asset.symbol,
        tokenAddress: prepared.asset.address,
        spender: prepared.spender,
        amount: prepared.amount,
      },
    }),
    createPlan: (prepared) =>
      createExecutionPlan({
        summary: `Approve ${prepared.spender} to spend ${prepared.amount} ${prepared.asset.symbol} on ${prepared.chain}`,
        group: "chain",
        protocol: "chain",
        command: "approve",
        chain: prepared.chain,
        accountType: "evm",
        steps: [
          createApprovalStep("Approve ERC-20 spender", {
            token: prepared.asset.symbol,
            tokenAddress: prepared.asset.address,
            spender: prepared.spender,
            amount: prepared.amount,
          }),
        ],
        metadata: {
          token: prepared.asset.symbol,
          tokenAddress: prepared.asset.address,
          spender: prepared.spender,
          amount: prepared.amount,
          isMaxApproval: prepared.isMaxApproval,
        },
      }),
    resolveAuth: async () => await getActiveWalletPort("evm"),
    execute: async (prepared, signer) => {
      const publicClient = getPublicClient(prepared.chain);
      const txGateway = new TxGateway(prepared.chain, publicClient, signer, {
        group: "chain",
        protocol: "chain",
        command: "approve",
      });
      const result = await txGateway.simulateAndWriteContract({
        address: prepared.asset.address,
        abi: ERC20_APPROVAL_METADATA_ABI,
        functionName: "approve",
        args: [prepared.spender, prepared.amountWei],
        intent: {
          kind: "token-approval",
          token: prepared.asset.address,
          spender: prepared.spender,
          amount: prepared.amountWei,
        },
        prompt: {
          action: "Approve ERC-20 spender",
          details: {
            chain: prepared.chain,
            token: prepared.asset.symbol,
            spender: prepared.spender,
            amount: prepared.amount,
          },
        },
      });

      return {
        amount: prepared.amount,
        chain: prepared.chain,
        owner: signer.address,
        spender: prepared.spender,
        token: prepared.asset.symbol,
        tokenAddress: prepared.asset.address,
        txHash: result.txHash,
        status: result.receipt.status === "success" ? "confirmed" : "failed",
      };
    },
  };
}

export default defineCommand({
  meta: {
    name: "approve",
    description: "Approve an ERC-20 spender",
  },
  args: {
    token: {
      type: "positional",
      description: "ERC-20 symbol or contract address",
      required: true,
    },
    spender: {
      type: "positional",
      description: "Spender address",
      required: true,
    },
    amount: {
      type: "positional",
      description: "Amount to approve",
      required: false,
    },
    max: {
      type: "boolean",
      description: "Approve the maximum uint256 allowance",
      default: false,
    },
    chain: evmChainArg(),
    yes: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const chain = validateChain(args.chain, SUPPORTED_CHAINS);
    const approval = validateApprovalMode(args.amount, args.max);

    if (!isAddress(args.spender)) {
      console.error(`Error: Invalid spender address: ${args.spender}`);
      process.exit(1);
    }

    try {
      await runWriteOperation(
        args,
        createChainApproveOperation({
          chain,
          token: args.token,
          spender: args.spender as Address,
          amount: approval.amount,
          isMaxApproval: approval.isMaxApproval,
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  },
});
