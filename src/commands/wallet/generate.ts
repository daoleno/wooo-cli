import { defineCommand } from "citty";
import { getWalletStore } from "../../core/context";
import { createOutput, resolveOutputOptions } from "../../core/output";

export default defineCommand({
  meta: { name: "generate", description: "Generate a new wallet" },
  args: {
    name: { type: "positional", description: "Wallet name", required: false },
    chain: {
      type: "string",
      description: "Chain type: evm, solana",
      default: "evm",
    },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const name = args.name || `wallet-${Date.now()}`;
    const store = getWalletStore();
    const wallet = await store.generate(name, args.chain);
    const out = createOutput(resolveOutputOptions(args));
    out.data({
      name: wallet.name,
      address: wallet.address,
      chain: wallet.chain,
      active: wallet.active,
    });
  },
});
