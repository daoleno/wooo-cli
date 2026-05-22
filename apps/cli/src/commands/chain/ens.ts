import { defineCommand } from "citty";
import { type Address, isAddress } from "viem";
import { normalize } from "viem/ens";
import { getPublicClient } from "../../core/evm";
import { createOutput, resolveOutputOptions } from "../../core/output";

export default defineCommand({
  meta: { name: "ens", description: "Resolve ENS name ↔ address" },
  args: {
    nameOrAddress: {
      type: "positional",
      description: "ENS name (vitalik.eth) or address (0x...)",
      required: true,
    },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));
    const publicClient = getPublicClient("ethereum"); // ENS is on mainnet

    if (isAddress(args.nameOrAddress)) {
      // Reverse lookup: address → name
      const name = await publicClient.getEnsName({
        address: args.nameOrAddress as Address,
      });
      out.data({
        address: args.nameOrAddress,
        name: name || "No ENS name found",
      });
    } else {
      // Forward lookup: name → address
      const address = await publicClient.getEnsAddress({
        name: normalize(args.nameOrAddress),
      });
      if (!address) {
        console.error(`ENS name not found: ${args.nameOrAddress}`);
        process.exit(1);
      }
      out.data({
        name: args.nameOrAddress,
        address,
      });
    }
  },
});
