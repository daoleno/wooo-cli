import { getWallet } from "@open-wallet-standard/core";
import { type ChainFamily, getChainFamily, resolveChainId } from "./chain-ids";
import {
  getConfigDir,
  getVaultPath,
  loadWoooConfigSync,
  setDefaultWalletIfMissing,
} from "./config";
import { ExternalWalletRegistry } from "./external-wallets";
import { exportOwsPrivateKey, resolveOwsPassphrase } from "./ows";
import { createSigner, type ResolvedWallet, type WoooSigner } from "./signers";

// ---------------------------------------------------------------------------
// Singleton external wallet registry
// ---------------------------------------------------------------------------

let _externalRegistry: ExternalWalletRegistry | undefined;
let _externalRegistryConfigDir: string | undefined;

export function getExternalWalletRegistry(): ExternalWalletRegistry {
  const configDir = getConfigDir();
  if (!_externalRegistry || _externalRegistryConfigDir !== configDir) {
    _externalRegistry = new ExternalWalletRegistry(configDir);
    _externalRegistryConfigDir = configDir;
  }
  return _externalRegistry;
}

function walletExists(name: string): boolean {
  try {
    getWallet(name, getVaultPath());
    return true;
  } catch {
    return Boolean(getExternalWalletRegistry().get(name));
  }
}

export function bootstrapDefaultWallet(walletName: string): void {
  setDefaultWalletIfMissing(walletName, {
    shouldReplace: (currentWallet) => !walletExists(currentWallet),
  });
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
  const vaultPath = getVaultPath();

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
      vaultPath,
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
      signerUrl: extWallet.signerUrl,
      authEnv: extWallet.authEnv,
    };
  }

  throw new Error(
    `Wallet "${walletName}" not found. Run \`wooo wallet create\` to create a new wallet or \`wooo wallet connect\` to add an external wallet.`,
  );
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

const DEFAULT_CHAIN_BY_FAMILY: Record<ChainFamily, string> = {
  evm: "ethereum",
  solana: "solana",
};

function resolvePreferredChainAlias(requiredType?: ChainFamily): string {
  const configuredChain = loadWoooConfigSync().default?.chain ?? "ethereum";
  if (!requiredType) {
    return configuredChain;
  }

  try {
    if (getChainFamily(resolveChainId(configuredChain)) === requiredType) {
      return configuredChain;
    }
  } catch {
    // Fall back to the family default below.
  }

  return DEFAULT_CHAIN_BY_FAMILY[requiredType];
}

/**
 * Read-only wallet info (name + address + chainId) for protocols that only need
 * an address, without requiring signing capability.
 */
export async function getActiveWallet(
  requiredType?: ChainFamily,
): Promise<{ name: string; address: string; chainId: string }> {
  const chainAlias = resolvePreferredChainAlias(requiredType);
  const wallet = await resolveWallet(undefined, chainAlias);

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
  chainType: ChainFamily,
): Promise<WoooSigner> {
  const chainAlias = resolvePreferredChainAlias(chainType);
  const wallet = await resolveWallet(undefined, chainAlias);
  return createSigner(wallet);
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
  const wallet = await resolveWallet(
    undefined,
    resolvePreferredChainAlias(chainType),
  );

  if (wallet.source === "external") {
    throw new Error(
      `Raw key export is not available for external wallet "${wallet.name}".`,
    );
  }

  const passphrase = await resolveOwsPassphrase();
  return await exportOwsPrivateKey(
    wallet.name,
    chainType,
    wallet.vaultPath,
    passphrase,
  );
}
