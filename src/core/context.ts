import { homedir } from "node:os";
import { join } from "node:path";
import { password } from "@clack/prompts";
import { exportWallet, getWallet } from "@open-wallet-standard/core";
import { type ChainFamily, getChainFamily, resolveChainId } from "./chain-ids";
import { loadWoooConfigSync } from "./config";
import { ExternalWalletRegistry } from "./external-wallets";
import { createSigner, type ResolvedWallet, type WoooSigner } from "./signers";

// ---------------------------------------------------------------------------
// Config dir helper
// ---------------------------------------------------------------------------

function getConfigDir(): string {
  return process.env.WOOO_CONFIG_DIR ?? join(homedir(), ".config", "wooo");
}

// ---------------------------------------------------------------------------
// Singleton external wallet registry
// ---------------------------------------------------------------------------

let _externalRegistry: ExternalWalletRegistry | undefined;

export function getExternalWalletRegistry(): ExternalWalletRegistry {
  if (!_externalRegistry) {
    _externalRegistry = new ExternalWalletRegistry(getConfigDir());
  }
  return _externalRegistry;
}

// ---------------------------------------------------------------------------
// Passphrase resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the OWS passphrase for signing operations:
 *   1. OWS_API_KEY present → agent mode, no passphrase needed → undefined
 *   2. OWS_PASSPHRASE env set → use it directly
 *   3. Otherwise → interactive prompt via @clack/prompts
 */
export async function resolvePassphrase(): Promise<string | undefined> {
  // Agent / API-key mode: OWS handles auth internally, no passphrase needed
  if (process.env.OWS_API_KEY) {
    return undefined;
  }

  // Explicit passphrase from environment
  if (process.env.OWS_PASSPHRASE) {
    return process.env.OWS_PASSPHRASE;
  }

  // Interactive prompt
  const result = await password({
    message: "Enter wallet passphrase:",
  });

  if (typeof result === "symbol") {
    throw new Error("Passphrase input was cancelled");
  }

  return result;
}

// ---------------------------------------------------------------------------
// Core wallet resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a wallet by name + chain to a ResolvedWallet.
 *
 * Resolution order:
 *   1. OWS vault — matched by chain FAMILY (all eip155:* share the same EVM address)
 *   2. External wallet registry
 *
 * The vault path is passed to every OWS call so it respects WOOO_CONFIG_DIR.
 */
export async function resolveWallet(
  name?: string,
  chain?: string,
): Promise<ResolvedWallet> {
  const config = loadWoooConfigSync();
  const walletName = name ?? config.default?.wallet ?? "main";
  const chainAlias = chain ?? config.default?.chain ?? "ethereum";
  const chainId = resolveChainId(chainAlias);
  const chainFamily = getChainFamily(chainId);
  const vaultPath = join(getConfigDir(), "vault");

  // Try OWS vault first
  try {
    const owsWallet = getWallet(walletName, vaultPath);
    // Match by chain family: same EVM address across all eip155:* chains
    const account = owsWallet.accounts.find((a) => {
      try {
        return getChainFamily(a.chainId) === chainFamily;
      } catch {
        return false;
      }
    });
    if (!account) {
      throw new Error(`Wallet "${walletName}" has no ${chainFamily} account`);
    }
    return {
      source: "ows",
      name: walletName,
      walletId: owsWallet.id,
      address: account.address,
      chainId,
    };
  } catch (err) {
    // If the error is the chain-family mismatch we surfaced ourselves, re-throw
    if (err instanceof Error && err.message.includes("has no")) {
      throw err;
    }
    // Otherwise assume wallet isn't in OWS — fall through to external registry
  }

  // Try external registry
  const extWallet = getExternalWalletRegistry().get(walletName);
  if (extWallet) {
    if (extWallet.chainType !== chainFamily) {
      throw new Error(
        `Wallet "${walletName}" is ${extWallet.chainType}, but chain ${chainAlias} requires ${chainFamily}`,
      );
    }
    return {
      source: "external",
      name: walletName,
      address: extWallet.address,
      chainId,
      transport: extWallet.transport,
    };
  }

  throw new Error(
    `Wallet "${walletName}" not found. Run \`wooo wallet generate\` to create a new wallet or \`wooo wallet connect\` to add an external wallet.`,
  );
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Read-only wallet info (name + address + chainId) for protocols that only need
 * an address, without requiring signing capability.
 */
export async function getActiveWallet(
  requiredType?: ChainFamily,
): Promise<{ name: string; address: string; chainId: string }> {
  const config = loadWoooConfigSync();
  const chainAlias = config.default?.chain ?? "ethereum";
  const wallet = await resolveWallet(undefined, chainAlias);

  if (requiredType) {
    const family = getChainFamily(wallet.chainId);
    if (family !== requiredType) {
      throw new Error(
        `Active wallet "${wallet.name}" is ${family}, but this command requires a ${requiredType} wallet.`,
      );
    }
  }

  return {
    name: wallet.name,
    address: wallet.address,
    chainId: wallet.chainId,
  };
}

/**
 * Obtain a WoooSigner for signing operations on the active wallet.
 *
 * @param chainType - "evm" or "solana"
 */
export async function getActiveSigner(
  _chainType: ChainFamily,
): Promise<WoooSigner> {
  const config = loadWoooConfigSync();
  const chainAlias = config.default?.chain ?? "ethereum";
  const wallet = await resolveWallet(undefined, chainAlias);
  return createSigner(wallet);
}

// ---------------------------------------------------------------------------
// Raw private key export (for x402 / mpp — they need a viem LocalAccount)
// ---------------------------------------------------------------------------

function ensureHexPrefix(hex: string): `0x${string}` {
  return (hex.startsWith("0x") ? hex : `0x${hex}`) as `0x${string}`;
}

/**
 * Export the raw private key for the active wallet.
 *
 * Only available for OWS-managed wallets. External wallets do not expose raw keys.
 *
 * - Mnemonic wallets: derive key via @scure/bip32 + @scure/bip39
 * - Private-key wallets: parse the exported JSON and return the key directly
 *
 * @param chainType - "evm" or "solana"
 */
export async function getActivePrivateKey(
  chainType: ChainFamily,
): Promise<`0x${string}`> {
  const wallet = await resolveWallet();

  if (wallet.source === "external") {
    throw new Error(
      `Raw key export is not available for external wallet "${wallet.name}".`,
    );
  }

  const vaultPath = join(getConfigDir(), "vault");
  const passphrase = await resolvePassphrase();
  const exported = exportWallet(wallet.name, passphrase, vaultPath);

  // Try JSON (private-key import format: { secp256k1: "...", ed25519: "..." })
  try {
    const parsed = JSON.parse(exported) as Record<string, unknown>;
    if (chainType === "evm" && typeof parsed.secp256k1 === "string") {
      return ensureHexPrefix(parsed.secp256k1);
    }
    if (chainType === "solana" && typeof parsed.ed25519 === "string") {
      return ensureHexPrefix(parsed.ed25519);
    }
  } catch {
    // Not JSON — treat as mnemonic (fall through)
  }

  // Derive from mnemonic using BIP-39 / BIP-44
  if (chainType === "evm") {
    const { HDKey } = await import("@scure/bip32");
    const { mnemonicToSeedSync } = await import("@scure/bip39");
    const seed = mnemonicToSeedSync(exported);
    const hd = HDKey.fromMasterSeed(seed);
    const derived = hd.derive("m/44'/60'/0'/0/0");
    if (!derived.privateKey) {
      throw new Error("Failed to derive EVM private key from mnemonic");
    }
    return `0x${Buffer.from(derived.privateKey).toString("hex")}` as `0x${string}`;
  }

  throw new Error(
    `Private key derivation for ${chainType} from mnemonic is not yet supported.`,
  );
}
