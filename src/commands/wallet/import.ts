import ansis from "ansis";
import { defineCommand } from "citty";
import { getWalletStore } from "../../core/context";
import { createOutput, resolveOutputOptions } from "../../core/output";

export default defineCommand({
  meta: { name: "import", description: "Import a wallet from private key" },
  args: {
    key: {
      type: "positional",
      description: "Private key (or use stdin/--file/interactive)",
      required: false,
    },
    name: { type: "string", description: "Wallet name" },
    file: { type: "string", description: "Read private key from file" },
    chain: { type: "string", description: "Chain type", default: "evm" },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    let privateKey: string;
    if (args.file) {
      const { readFileSync } = await import("node:fs");
      privateKey = readFileSync(args.file, "utf-8").trim();
    } else if (args.key) {
      console.error(
        ansis.yellow(
          "⚠ Warning: Private key in CLI args is visible in shell history.",
        ),
      );
      privateKey = args.key;
    } else if (process.stdin.isTTY) {
      const clack = await import("@clack/prompts");
      const value = await clack.password({ message: "Enter private key:" });
      if (!value || typeof value === "symbol") {
        console.error("No key provided");
        process.exit(6);
      }
      privateKey = value;
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk);
      }
      privateKey = Buffer.concat(chunks).toString("utf-8").trim();
    }
    const name = args.name || `imported-${Date.now()}`;
    const store = getWalletStore();
    const wallet = await store.importKey(name, privateKey, args.chain);
    const out = createOutput(resolveOutputOptions(args));
    out.data({
      name: wallet.name,
      address: wallet.address,
      chain: wallet.chain,
    });
  },
});
