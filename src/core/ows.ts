import { password } from "@clack/prompts";
import { exportWallet } from "@open-wallet-standard/core";
import type { ChainFamily } from "./chain-ids";

export function ensureHexPrefix(hex: string): `0x${string}` {
  return (hex.startsWith("0x") ? hex : `0x${hex}`) as `0x${string}`;
}

export async function resolveOwsPassphrase(): Promise<string | undefined> {
  if (process.env.OWS_API_KEY) {
    return undefined;
  }

  if (process.env.OWS_PASSPHRASE) {
    return process.env.OWS_PASSPHRASE;
  }

  const result = await password({
    message: "Enter wallet passphrase:",
  });

  if (typeof result === "symbol") {
    throw new Error("Passphrase input was cancelled");
  }

  return result;
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
