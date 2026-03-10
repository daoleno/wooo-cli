import { defineCommand } from "citty";
import { type Address, formatEther, formatUnits, isAddress } from "viem";
import { getPublicClient } from "../../core/evm";
import { createOutput, resolveOutputOptions } from "../../core/output";

const ERC20_BALANCE_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
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

export default defineCommand({
  meta: { name: "balance", description: "Check native or token balance of an address" },
  args: {
    address: {
      type: "positional",
      description: "Wallet address",
      required: true,
    },
    token: {
      type: "string",
      description: "ERC-20 token contract address (omit for native balance)",
    },
    chain: { type: "string", default: "ethereum" },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));
    const publicClient = getPublicClient(args.chain);

    if (!isAddress(args.address)) {
      console.error(`Invalid address: ${args.address}`);
      process.exit(2);
    }

    if (args.token) {
      if (!isAddress(args.token)) {
        console.error(`Invalid token address: ${args.token}`);
        process.exit(2);
      }

      const [balance, decimals, symbol] = await Promise.all([
        publicClient.readContract({
          address: args.token as Address,
          abi: ERC20_BALANCE_ABI,
          functionName: "balanceOf",
          args: [args.address as Address],
        }) as Promise<bigint>,
        publicClient.readContract({
          address: args.token as Address,
          abi: ERC20_BALANCE_ABI,
          functionName: "decimals",
        }) as Promise<number>,
        publicClient.readContract({
          address: args.token as Address,
          abi: ERC20_BALANCE_ABI,
          functionName: "symbol",
        }) as Promise<string>,
      ]);

      out.data({
        address: args.address,
        token: symbol,
        balance: formatUnits(balance, decimals),
        chain: args.chain,
      });
    } else {
      const balance = await publicClient.getBalance({
        address: args.address as Address,
      });

      out.data({
        address: args.address,
        token: "ETH",
        balance: formatEther(balance),
        chain: args.chain,
      });
    }
  },
});
