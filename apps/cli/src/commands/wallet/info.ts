import { join } from "node:path";
import { getWallet } from "@open-wallet-standard/core";
import { defineCommand } from "citty";
import { getConfigDir } from "../../core/config";
import { createOutput, resolveOutputOptions } from "../../core/output";

export default defineCommand({
  meta: { name: "info", description: "Show wallet details" },
  args: {
    name: {
      type: "positional",
      description: "Wallet name or ID",
      required: true,
    },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const vaultPath = join(getConfigDir(), "vault");
    const wallet = getWallet(args.name, vaultPath);
    const out = createOutput(resolveOutputOptions(args));
    const outputOptions = resolveOutputOptions(args);

    if (outputOptions.json || outputOptions.format === "json") {
      out.data({
        name: wallet.name,
        id: wallet.id,
        createdAt: wallet.createdAt,
        accounts: wallet.accounts.map((a) => ({
          chain: a.chainId,
          address: a.address,
          path: a.derivationPath,
        })),
      });
      return;
    }

    out.data(`Name: ${wallet.name}`);
    out.data(`ID: ${wallet.id}`);
    out.data(`Created: ${wallet.createdAt}`);

    out.table(
      wallet.accounts.map((a) => ({
        chain: a.chainId,
        address: a.address,
        path: a.derivationPath,
      })),
      {
        columns: ["chain", "address", "path"],
        title: "Accounts",
      },
    );
  },
});
