import { join } from "node:path";
import { deleteWallet } from "@open-wallet-standard/core";
import ansis from "ansis";
import { defineCommand } from "citty";
import { getConfigDir } from "../../core/config";
import { createOutput, resolveOutputOptions } from "../../core/output";

export default defineCommand({
  meta: { name: "delete", description: "Delete a wallet from the OWS vault" },
  args: {
    name: {
      type: "positional",
      description: "Wallet name or ID",
      required: true,
    },
    confirm: {
      type: "boolean",
      description: "Confirm deletion",
      default: false,
    },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    if (!args.confirm) {
      console.error(
        ansis.yellow(
          "This will permanently delete the wallet. Pass --confirm to proceed.",
        ),
      );
      process.exit(1);
    }

    const vaultPath = join(getConfigDir(), "vault");
    deleteWallet(args.name, vaultPath);
    const out = createOutput(resolveOutputOptions(args));
    out.success(`Deleted wallet "${args.name}"`);
  },
});
