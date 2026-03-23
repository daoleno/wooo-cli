import { join } from "node:path";
import { exportWallet } from "@open-wallet-standard/core";
import ansis from "ansis";
import { defineCommand } from "citty";
import { getConfigDir } from "../../core/config";
import { resolvePassphrase } from "../../core/context";
import { createOutput, resolveOutputOptions } from "../../core/output";

export default defineCommand({
  meta: { name: "export", description: "Export wallet secret material" },
  args: {
    name: {
      type: "positional",
      description: "Wallet name or ID",
      required: true,
    },
    confirm: {
      type: "boolean",
      description: "Confirm you understand the security implications",
      default: false,
    },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    if (!args.confirm) {
      console.error(
        ansis.yellow(
          "This command exports sensitive key material. Pass --confirm to proceed.",
        ),
      );
      process.exit(1);
    }

    const passphrase = await resolvePassphrase();
    const vaultPath = join(getConfigDir(), "vault");
    const exported = exportWallet(args.name, passphrase, vaultPath);
    const out = createOutput(resolveOutputOptions(args));

    console.error(
      ansis.yellow(
        "WARNING: The following output contains sensitive key material. Do not share it.",
      ),
    );

    out.data({ name: args.name, secret: exported });
  },
});
