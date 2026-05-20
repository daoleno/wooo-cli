import { defineCommand } from "citty";
import {
  checkKeychainSecret,
  formatKeychainRef,
  getSecretStorageDescription,
} from "../../core/secrets";

export default defineCommand({
  meta: {
    name: "check",
    description: "Check whether a keychain secret exists",
  },
  args: {
    name: {
      type: "positional",
      description: "Secret name",
      required: true,
    },
  },
  async run({ args }) {
    const exists = await checkKeychainSecret(args.name);
    if (!exists) {
      throw new Error(
        `${formatKeychainRef(args.name)} was not found in ${getSecretStorageDescription()}.`,
      );
    }
    console.log(`${formatKeychainRef(args.name)} is present`);
  },
});
