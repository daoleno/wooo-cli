import { confirm } from "@clack/prompts";
import { defineCommand } from "citty";
import { getCredentialService } from "../../core/credentials";
import {
  deleteKeychainSecret,
  formatKeychainRef,
  getSecretStorageDescription,
} from "../../core/secrets";

export default defineCommand({
  meta: {
    name: "delete",
    description: "Delete default keychain credentials for a service",
  },
  args: {
    service: {
      type: "positional",
      description: "Credential service, for example okx or okx-onchain",
      required: true,
    },
    yes: {
      type: "boolean",
      description: "Delete without an interactive confirmation",
      default: false,
    },
  },
  async run({ args }) {
    const service = getCredentialService(args.service);
    if (!args.yes) {
      const accepted = await confirm({
        message: `Delete default ${service.label} credentials from ${getSecretStorageDescription()}?`,
      });
      if (typeof accepted === "symbol" || !accepted) {
        throw new Error("Credential deletion was cancelled.");
      }
    }

    for (const field of service.fields) {
      const deleted = await deleteKeychainSecret(field.defaultAccount);
      const ref = formatKeychainRef(field.defaultAccount);
      console.log(
        `${deleted ? "Deleted" : "Not found"} ${field.label}: ${ref}`,
      );
    }
  },
});
