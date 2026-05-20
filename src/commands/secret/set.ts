import { defineCommand } from "citty";
import {
  formatKeychainRef,
  readSecretFromPrompt,
  setKeychainSecret,
} from "../../core/secrets";

export default defineCommand({
  meta: {
    name: "set",
    description: "Store a secret in the OS keychain",
  },
  args: {
    name: {
      type: "positional",
      description: "Secret name, for example okx/api-secret",
      required: true,
    },
    value: {
      type: "string",
      description: "Secret value. Omit to enter it interactively.",
    },
  },
  async run({ args }) {
    const value =
      args.value ?? (await readSecretFromPrompt(`Enter ${args.name}:`));
    const ref = await setKeychainSecret(args.name, value);
    console.log(`Stored ${formatKeychainRef(args.name)}`);
    console.log(`Secret ref: ${ref}`);
  },
});
