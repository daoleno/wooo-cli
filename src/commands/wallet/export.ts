import { defineCommand } from "citty";
import { getWalletStore } from "../../core/context";
import ansis from "ansis";

export default defineCommand({
  meta: { name: "export", description: "Export wallet private key" },
  args: {
    name: { type: "positional", description: "Wallet name", required: true },
    yes: { type: "boolean", default: false },
  },
  async run({ args }) {
    if (!args.yes) {
      if (process.stdout.isTTY) {
        const clack = await import("@clack/prompts");
        const confirmed = await clack.confirm({ message: "This will display your private key. Continue?" });
        if (!confirmed) process.exit(6);
      } else {
        console.error(ansis.yellow("⚠ This will display your private key. Use --yes to confirm."));
        process.exit(6);
      }
    }
    const store = getWalletStore();
    const key = await store.exportKey(args.name);
    if (!key) { console.error(`Wallet "${args.name}" not found`); process.exit(1); }
    console.log(key);
  },
});
