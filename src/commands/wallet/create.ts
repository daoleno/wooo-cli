import { join } from "node:path";
import { createWallet } from "@open-wallet-standard/core";
import { defineCommand } from "citty";
import { getConfigDir } from "../../core/config";
import { resolvePassphrase } from "../../core/context";
import { createOutput, resolveOutputOptions } from "../../core/output";

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

    const passphrase = await resolvePassphrase();
    const vaultPath = join(getConfigDir(), "vault");
    const wallet = await createWallet(args.name, passphrase, words, vaultPath);
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
