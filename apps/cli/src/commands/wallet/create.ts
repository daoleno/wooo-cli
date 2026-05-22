import { createWallet } from "@open-wallet-standard/core";
import { defineCommand } from "citty";
import { getVaultPath } from "../../core/config";
import { bootstrapDefaultWallet } from "../../core/context";
import { createOutput, resolveOutputOptions } from "../../core/output";
import { resolveOwsPassphrase } from "../../core/ows";

export default defineCommand({
  meta: { name: "create", description: "Create a new OWS wallet" },
  args: {
    name: {
      type: "positional",
      description: "Wallet name",
      required: true,
    },
    words: {
      type: "string",
      description: "Mnemonic word count (12 or 24)",
      default: "12",
    },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const words = Number.parseInt(args.words, 10);
    if (words !== 12 && words !== 24) {
      console.error("--words must be 12 or 24");
      process.exit(1);
    }

    const passphrase = await resolveOwsPassphrase();
    const vaultPath = getVaultPath();
    const wallet = await createWallet(args.name, passphrase, words, vaultPath);
    bootstrapDefaultWallet(wallet.name);
    const out = createOutput(resolveOutputOptions(args));
    out.data({
      name: wallet.name,
      id: wallet.id,
      accounts: wallet.accounts.map((a) => ({
        chain: a.chainId,
        address: a.address,
        path: a.derivationPath,
      })),
    });
  },
});
