import { confirm } from "@clack/prompts";
import { defineCommand } from "citty";
import {
  deleteKeychainSecret,
  formatKeychainRef,
  getSecretStorageDescription,
} from "../../core/secrets";

export default defineCommand({
  meta: {
    name: "delete",
    description: "Delete a secret from the OS keychain",
  },
  args: {
    name: {
      type: "positional",
      description: "Secret name",
      required: true,
    },
    yes: {
      type: "boolean",
      description: "Delete without an interactive confirmation",
      default: false,
    },
  },
  async run({ args }) {
    if (!args.yes) {
      const accepted = await confirm({
        message: `Delete ${formatKeychainRef(args.name)} from ${getSecretStorageDescription()}?`,
      });
      if (typeof accepted === "symbol" || !accepted) {
        throw new Error("Secret deletion was cancelled.");
      }
    }

    const deleted = await deleteKeychainSecret(args.name);
    if (!deleted) {
      throw new Error(
        `${formatKeychainRef(args.name)} was not found in ${getSecretStorageDescription()}.`,
      );
    }
    console.log(`Deleted ${formatKeychainRef(args.name)}`);
  },
});
