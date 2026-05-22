import { password } from "@clack/prompts";
import { exportWallet } from "@open-wallet-standard/core";
import type { ChainFamily } from "./chain-ids";
import {
  checkSecretRef,
  readSecretRefEnv,
  requireSecret,
  type SecretValue,
} from "./secrets";

const DEFAULT_OWS_API_KEY_REF = "keychain:ows/api-key";
const DEFAULT_OWS_PASSPHRASE_REF = "keychain:ows/passphrase";

export interface OwsAuth {
  apiKey?: SecretValue;
  passphrase?: SecretValue | string;
}

export function ensureHexPrefix(hex: string): `0x${string}` {
  return (hex.startsWith("0x") ? hex : `0x${hex}`) as `0x${string}`;
}

async function promptForOwsPassphrase(): Promise<string> {
  const result = await password({
    message: "Enter wallet passphrase:",
  });

  if (typeof result === "symbol") {
    throw new Error("Passphrase input was cancelled");
  }

  return result;
}

export async function resolveOwsAuth(options?: {
  allowApiKey?: boolean;
  promptPassphrase?: boolean;
}): Promise<OwsAuth> {
  let apiKeyRef = readSecretRefEnv("WOOO_OWS_API_KEY_REF", "OWS API key");
  let passphraseRef = readSecretRefEnv(
    "WOOO_OWS_PASSPHRASE_REF",
    "OWS passphrase",
  );

  if (apiKeyRef && passphraseRef) {
    throw new Error(
      "OWS auth is configured twice: set exactly one of WOOO_OWS_API_KEY_REF or WOOO_OWS_PASSPHRASE_REF.",
    );
  }

  if (!apiKeyRef && !passphraseRef) {
    const hasDefaultApiKey = await checkSecretRef(DEFAULT_OWS_API_KEY_REF);
    const hasDefaultPassphrase = await checkSecretRef(
      DEFAULT_OWS_PASSPHRASE_REF,
    );
    if (hasDefaultApiKey && hasDefaultPassphrase) {
      throw new Error(
        "OWS auth is configured twice: keep exactly one of keychain:ows/api-key or keychain:ows/passphrase.",
      );
    }
    apiKeyRef = hasDefaultApiKey ? DEFAULT_OWS_API_KEY_REF : undefined;
    passphraseRef = hasDefaultPassphrase
      ? DEFAULT_OWS_PASSPHRASE_REF
      : undefined;
  }

  if (apiKeyRef) {
    if (!options?.allowApiKey) {
      throw new Error(
        "OWS passphrase is required for this operation. Use keychain:ows/passphrase.",
      );
    }
    return {
      apiKey: await requireSecret(apiKeyRef, "OWS API key"),
    };
  }

  if (passphraseRef) {
    return {
      passphrase: await requireSecret(passphraseRef, "OWS passphrase"),
    };
  }

  if (options?.promptPassphrase === false) {
    return {};
  }

  return {
    passphrase: await promptForOwsPassphrase(),
  };
}

export async function resolveOwsPassphrase(): Promise<string | undefined> {
  const auth = await resolveOwsAuth({ allowApiKey: false });
  if (!auth.passphrase) {
    return undefined;
  }
  return typeof auth.passphrase === "string"
    ? auth.passphrase
    : auth.passphrase.reveal();
}

export async function withOwsApiKey<T>(
  apiKey: SecretValue | undefined,
  operation: () => T | Promise<T>,
): Promise<T> {
  if (!apiKey) {
    return await operation();
  }

  const previous = process.env.OWS_API_KEY;
  process.env.OWS_API_KEY = apiKey.reveal();
  try {
    return await operation();
  } finally {
    if (previous === undefined) {
      delete process.env.OWS_API_KEY;
    } else {
      process.env.OWS_API_KEY = previous;
    }
  }
}

export async function exportOwsPrivateKey(
  walletNameOrId: string,
  chainType: ChainFamily,
  vaultPath: string,
  passphrase?: string,
): Promise<`0x${string}`> {
  const exported = exportWallet(walletNameOrId, passphrase, vaultPath);

  try {
    const parsed = JSON.parse(exported) as Record<string, unknown>;
    if (chainType === "evm" && typeof parsed.secp256k1 === "string") {
      return ensureHexPrefix(parsed.secp256k1);
    }
    if (chainType === "solana" && typeof parsed.ed25519 === "string") {
      return ensureHexPrefix(parsed.ed25519);
    }
  } catch {
    // Not JSON, fall through to mnemonic-derived key handling.
  }

  if (chainType === "evm") {
    const { HDKey } = await import("@scure/bip32");
    const { mnemonicToSeedSync } = await import("@scure/bip39");
    const seed = mnemonicToSeedSync(exported);
    const hd = HDKey.fromMasterSeed(seed);
    const derived = hd.derive("m/44'/60'/0'/0/0");

    if (!derived.privateKey) {
      throw new Error("Failed to derive EVM private key from mnemonic");
    }

    return ensureHexPrefix(Buffer.from(derived.privateKey).toString("hex"));
  }

  throw new Error(
    `Private key derivation for ${chainType} from mnemonic is not yet supported.`,
  );
}
