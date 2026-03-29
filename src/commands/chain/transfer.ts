import { defineCommand } from "citty";
import { type Address, isAddress, parseUnits } from "viem";
import { evmChainArg, resolveChainId } from "../../core/chain-ids";
import { getActiveWalletPort } from "../../core/context";
import { getChain, getPublicClient } from "../../core/evm";
import {
  createExecutionPlan,
  createTransactionStep,
} from "../../core/execution-plan";
import { TxGateway } from "../../core/tx-gateway";
import { validateAmount, validateChain } from "../../core/validation";
import {
  runWriteOperation,
  type WriteOperation,
} from "../../core/write-operation";
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

const ERC20_TRANSFER_METADATA_ABI = [
  ...ERC20_ABI,
  {
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
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

interface TransferAsset {
  address?: Address;
  decimals: number;
  isNative: boolean;
  symbol: string;
}

interface PreparedChainTransfer {
  amount: string;
  amountWei: bigint;
  asset: TransferAsset;
  chain: string;
  recipient: Address;
}

interface ChainTransferResult {
  amount: string;
  chain: string;
  from: string;
  status: "confirmed" | "failed";
  to: string;
  token: string;
  tokenAddress?: string;
  txHash: string;
}

async function resolveTransferAsset(
  chain: string,
  token: string | undefined,
): Promise<TransferAsset> {
  if (!token) {
    const nativeCurrency = getChain(chain).nativeCurrency;
    return {
      symbol: nativeCurrency.symbol,
      decimals: nativeCurrency.decimals,
      isNative: true,
    };
  }

  const normalizedToken = token.trim().toUpperCase();
  const nativeSymbol = getChain(chain).nativeCurrency.symbol.toUpperCase();
  if (normalizedToken === nativeSymbol) {
    const wrappedSymbol = NATIVE_WRAPS[normalizedToken];
    throw new Error(
      `Token "${normalizedToken}" is the native asset on ${chain}. Omit --token to send native ${nativeSymbol}, or use ${wrappedSymbol} explicitly if you meant the wrapped ERC-20.`,
    );
  }

  if (isAddress(token)) {
    const publicClient = getPublicClient(chain);
    const [decimals, symbol] = await Promise.all([
      publicClient.readContract({
        address: token,
        abi: ERC20_TRANSFER_METADATA_ABI,
        functionName: "decimals",
      }) as Promise<number>,
      publicClient.readContract({
        address: token,
        abi: ERC20_TRANSFER_METADATA_ABI,
        functionName: "symbol",
      }) as Promise<string>,
    ]);

    return {
      address: token,
      decimals,
      isNative: false,
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
    isNative: false,
    symbol: normalizedToken,
  };
}

function createChainTransferOperation(params: {
  amount: string;
  chain: string;
  recipient: Address;
  token?: string;
}): WriteOperation<
  PreparedChainTransfer,
  Awaited<ReturnType<typeof getActiveWalletPort>>,
  ChainTransferResult
> {
  return {
    protocol: "chain",
    prepare: async () => {
      const asset = await resolveTransferAsset(params.chain, params.token);
      return {
        chain: params.chain,
        recipient: params.recipient,
        amount: params.amount,
        amountWei: parseUnits(params.amount, asset.decimals),
        asset,
      };
    },
    createPreview: (prepared) => ({
      action: `Transfer ${prepared.amount} ${prepared.asset.symbol} to ${prepared.recipient} on ${prepared.chain}`,
      details: {
        chain: prepared.chain,
        token: prepared.asset.symbol,
        tokenAddress: prepared.asset.address ?? "native",
        amount: prepared.amount,
        recipient: prepared.recipient,
      },
    }),
    createPlan: (prepared) =>
      createExecutionPlan({
        summary: `Transfer ${prepared.amount} ${prepared.asset.symbol} to ${prepared.recipient} on ${prepared.chain}`,
        group: "chain",
        protocol: "chain",
        command: "transfer",
        chain: prepared.chain,
        accountType: "evm",
        steps: [
          createTransactionStep(
            prepared.asset.isNative
              ? "Send native transfer"
              : "Send ERC-20 transfer",
            {
              token: prepared.asset.symbol,
              tokenAddress: prepared.asset.address ?? null,
              amount: prepared.amount,
              recipient: prepared.recipient,
            },
          ),
        ],
        metadata: {
          assetType: prepared.asset.isNative ? "native" : "erc20",
          token: prepared.asset.symbol,
          tokenAddress: prepared.asset.address,
          recipient: prepared.recipient,
        },
      }),
    resolveAuth: async () => await getActiveWalletPort("evm"),
    execute: async (prepared, signer) => {
      const publicClient = getPublicClient(prepared.chain);

      if (prepared.asset.isNative) {
        const txHash = await signer.signAndSendTransaction(
          resolveChainId(prepared.chain),
          {
            format: "evm-transaction",
            to: prepared.recipient,
            data: "0x",
            value: prepared.amountWei,
          },
          {
            group: "chain",
            protocol: "chain",
            command: "transfer",
          },
          {
            action: "Send native token transfer",
            details: {
              chain: prepared.chain,
              token: prepared.asset.symbol,
              amount: prepared.amount,
              recipient: prepared.recipient,
            },
          },
        );
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash as `0x${string}`,
        });

        return {
          amount: prepared.amount,
          chain: prepared.chain,
          from: signer.address,
          to: prepared.recipient,
          token: prepared.asset.symbol,
          txHash: txHash as string,
          status: receipt.status === "success" ? "confirmed" : "failed",
        };
      }

      const txGateway = new TxGateway(prepared.chain, publicClient, signer, {
        group: "chain",
        protocol: "chain",
        command: "transfer",
      });
      const result = await txGateway.simulateAndWriteContract({
        address: prepared.asset.address as Address,
        abi: ERC20_TRANSFER_METADATA_ABI,
        functionName: "transfer",
        args: [prepared.recipient, prepared.amountWei],
        prompt: {
          action: "Send ERC-20 transfer",
          details: {
            chain: prepared.chain,
            token: prepared.asset.symbol,
            amount: prepared.amount,
            recipient: prepared.recipient,
          },
        },
      });

      return {
        amount: prepared.amount,
        chain: prepared.chain,
        from: signer.address,
        to: prepared.recipient,
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
    name: "transfer",
    description: "Send native tokens or ERC-20s to another address",
  },
  args: {
    to: {
      type: "positional",
      description: "Recipient address",
      required: true,
    },
    amount: {
      type: "positional",
      description: "Amount to transfer",
      required: true,
    },
    token: {
      type: "string",
      description:
        "ERC-20 symbol or contract address (omit for native transfer)",
    },
    chain: evmChainArg(),
    yes: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const chain = validateChain(args.chain, SUPPORTED_CHAINS);
    validateAmount(args.amount, "Transfer amount");

    if (!isAddress(args.to)) {
      console.error(`Error: Invalid recipient address: ${args.to}`);
      process.exit(1);
    }

    try {
      await runWriteOperation(
        args,
        createChainTransferOperation({
          chain,
          recipient: args.to as Address,
          amount: args.amount,
          token: args.token,
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  },
});
