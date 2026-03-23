import { defineCommand } from "citty";
import { formatEther, formatGwei } from "viem";
import { evmChainArg, normalizeChainName } from "../../core/chain-ids";
import { getPublicClient } from "../../core/evm";
import { createOutput, resolveOutputOptions } from "../../core/output";

export default defineCommand({
  meta: { name: "tx", description: "View transaction details" },
  args: {
    hash: {
      type: "positional",
      description: "Transaction hash",
      required: true,
    },
    chain: evmChainArg(),
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));
    const chain = normalizeChainName(args.chain);
    const publicClient = getPublicClient(chain);

    const tx = await publicClient.getTransaction({
      hash: args.hash as `0x${string}`,
    });
    const receipt = await publicClient.getTransactionReceipt({
      hash: args.hash as `0x${string}`,
    });

    out.data({
      chain,
      hash: tx.hash,
      status: receipt.status,
      from: tx.from,
      to: tx.to,
      value: formatEther(tx.value),
      gasUsed: receipt.gasUsed.toString(),
      gasPrice: tx.gasPrice ? formatGwei(tx.gasPrice) : "N/A",
      blockNumber: Number(tx.blockNumber),
      nonce: tx.nonce,
    });
  },
});
