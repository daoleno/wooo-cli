import { defineCommand } from "citty";
import { getWalletStore, requireMasterPassword } from "../../core/context";
import { createOutput, resolveOutputOptions } from "../../core/output";
import { resolveWalletType } from "../../core/wallet-store";

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
    const walletType = resolveWalletType(args.chain);
    if (!walletType) {
      console.error(
        `Unsupported wallet type: ${args.chain}. Available: evm, solana`,
      );
      process.exit(1);
    }
    const store = getWalletStore();
    const wallet = await store.generate(
      name,
      walletType,
      await requireMasterPassword(),
    );
    const out = createOutput(resolveOutputOptions(args));
    out.data({
      name: wallet.name,
      address: wallet.address,
      chain: wallet.chain,
      auth: wallet.authKind,
      active: wallet.active,
    });
  },
});
