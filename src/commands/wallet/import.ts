import { join } from "node:path";
import {
  importWalletMnemonic,
  importWalletPrivateKey,
} from "@open-wallet-standard/core";
import ansis from "ansis";
import { defineCommand } from "citty";
import { getConfigDir } from "../../core/config";
import { resolvePassphrase } from "../../core/context";
import { createOutput, resolveOutputOptions } from "../../core/output";

export default defineCommand({
  meta: {
    name: "import",
    description: "Import a wallet from private key or mnemonic",
  },
  args: {
    name: {
      type: "positional",
      description: "Wallet name",
      required: true,
    },
    key: {
      type: "positional",
      description: "Private key (or use stdin/--file/--mnemonic)",
      required: false,
    },
    mnemonic: {
      type: "boolean",
      description: "Import from mnemonic phrase (interactive prompt)",
      default: false,
    },
    file: {
      type: "string",
      description: "Read key or mnemonic from file",
    },
    chain: {
      type: "string",
      description: "Chain hint for private key import (e.g. evm, solana)",
    },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const vaultPath = join(getConfigDir(), "vault");
    const out = createOutput(resolveOutputOptions(args));

    // Mnemonic import (interactive)
    if (args.mnemonic) {
      const clack = await import("@clack/prompts");
      const value = await clack.text({
        message: "Enter mnemonic phrase:",
        placeholder: "word1 word2 word3 ...",
      });
      if (!value || typeof value === "symbol") {
        console.error("No mnemonic provided");
        process.exit(6);
      }
      const passphrase = await resolvePassphrase();
      const wallet = await importWalletMnemonic(
        args.name,
        value,
        passphrase,
        undefined,
        vaultPath,
      );
      out.data({
        name: wallet.name,
        id: wallet.id,
        accounts: wallet.accounts.map((a) => ({
          chain: a.chainId,
          address: a.address,
          path: a.derivationPath,
        })),
      });
      return;
    }

    // Read secret material from source
    let secret: string;
    if (args.file) {
      const { readFileSync } = await import("node:fs");
      secret = readFileSync(args.file, "utf-8").trim();
    } else if (args.key) {
      console.error(
        ansis.yellow(
          "Warning: Private key in CLI args is visible in shell history.",
        ),
      );
      secret = args.key;
    } else if (process.stdin.isTTY) {
      const clack = await import("@clack/prompts");
      const value = await clack.password({ message: "Enter private key:" });
      if (!value || typeof value === "symbol") {
        console.error("No key provided");
        process.exit(6);
      }
      secret = value;
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk);
      }
      secret = Buffer.concat(chunks).toString("utf-8").trim();
    }

    // Detect if the secret looks like a mnemonic (space-separated words)
    const isMnemonic = secret.split(/\s+/).length >= 12;

    const passphrase = await resolvePassphrase();

    if (isMnemonic) {
      const wallet = await importWalletMnemonic(
        args.name,
        secret,
        passphrase,
        undefined,
        vaultPath,
      );
      out.data({
        name: wallet.name,
        id: wallet.id,
        accounts: wallet.accounts.map((a) => ({
          chain: a.chainId,
          address: a.address,
          path: a.derivationPath,
        })),
      });
    } else {
      const wallet = await importWalletPrivateKey(
        args.name,
        secret,
        passphrase,
        vaultPath,
        args.chain,
      );
      out.data({
        name: wallet.name,
        id: wallet.id,
        accounts: wallet.accounts.map((a) => ({
          chain: a.chainId,
          address: a.address,
          path: a.derivationPath,
        })),
      });
    }
  },
});
