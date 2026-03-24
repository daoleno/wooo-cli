import { getWallet } from "@open-wallet-standard/core";
import { type ChainFamily, getChainFamily, resolveChainId } from "./chain-ids";
import {
  getConfigDir,
  getVaultPath,
  loadWoooConfigSync,
  setDefaultWalletIfMissing,
} from "./config";
import { RemoteAccountRegistry } from "./external-wallets";
import { exportOwsPrivateKey, resolveOwsPassphrase } from "./ows";
import {
  createWalletPort,
  type ResolvedAccount,
  type WalletPort,
} from "./signers";

// ---------------------------------------------------------------------------
// Singleton remote account registry
// ---------------------------------------------------------------------------

let _remoteAccountRegistry: RemoteAccountRegistry | undefined;
let _remoteAccountRegistryConfigDir: string | undefined;

export function getRemoteAccountRegistry(): RemoteAccountRegistry {
  const configDir = getConfigDir();
  if (
    !_remoteAccountRegistry ||
    _remoteAccountRegistryConfigDir !== configDir
  ) {
    _remoteAccountRegistry = new RemoteAccountRegistry(configDir);
    _remoteAccountRegistryConfigDir = configDir;
  }
  return _remoteAccountRegistry;
}

function walletExists(name: string): boolean {
  try {
    getWallet(name, getVaultPath());
    return true;
  } catch {
    return Boolean(getRemoteAccountRegistry().get(name));
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
 * Resolve a wallet label + chain to a ResolvedAccount.
 *
 * Resolution order:
 *   1. OWS vault — matched by chain FAMILY (all eip155:* share the same EVM address)
 *   2. External wallet registry
 *
 * The vault path is passed to every OWS call so it respects WOOO_CONFIG_DIR.
 */
export async function resolveAccount(
  name?: string,
  chain?: string,
): Promise<ResolvedAccount> {
  const config = loadWoooConfigSync();
  const accountLabel = name ?? config.default?.wallet ?? "main";
  const chainAlias = chain ?? config.default?.chain ?? "ethereum";
  const chainId = resolveChainId(chainAlias);
  const chainFamily = getChainFamily(chainId);
  const vaultPath = getVaultPath();

  // Try OWS vault first
  try {
    const owsWallet = getWallet(accountLabel, vaultPath);
    // Match by chain family: same EVM address across all eip155:* chains
    const account = owsWallet.accounts.find((a) => {
      try {
        return getChainFamily(a.chainId) === chainFamily;
      } catch {
        return false;
      }
    });
    if (!account) {
      throw new Error(`Wallet "${accountLabel}" has no ${chainFamily} account`);
    }
    return {
      address: account.address,
      chainFamily,
      chainId,
      custody: "local",
      label: accountLabel,
      vaultPath,
      walletId: owsWallet.id,
    };
  } catch (err) {
    // If the error is the chain-family mismatch we surfaced ourselves, re-throw
    if (err instanceof Error && err.message.includes("has no")) {
      throw err;
    }
    // Otherwise assume wallet isn't in OWS — fall through to external registry
  }

  // Try external registry
  const remoteAccount = getRemoteAccountRegistry().get(accountLabel);
  if (remoteAccount) {
    if (remoteAccount.chainFamily !== chainFamily) {
      throw new Error(
        `Account "${accountLabel}" is ${remoteAccount.chainFamily}, but chain ${chainAlias} requires ${chainFamily}`,
      );
    }
    return {
      address: remoteAccount.address,
      authEnv: remoteAccount.authEnv,
      chainFamily,
      chainId,
      custody: "remote",
      label: accountLabel,
      signerUrl: remoteAccount.signerUrl,
    };
  }

  throw new Error(
    `Wallet "${accountLabel}" not found. Run \`wooo wallet create\` to create a new wallet or \`wooo wallet connect\` to add a remote account.`,
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
  const wallet = await resolveAccount(undefined, chainAlias);

  return {
    name: wallet.label,
    address: wallet.address,
    chainId: wallet.chainId,
  };
}

/**
 * Obtain a WalletPort for signing operations on the active wallet.
 *
 * @param chainType - "evm" or "solana"
 */
export async function getActiveWalletPort(
  chainFamily: ChainFamily,
): Promise<WalletPort> {
  const chainAlias = resolvePreferredChainAlias(chainFamily);
  const account = await resolveAccount(undefined, chainAlias);
  return createWalletPort(account);
}

/**
 * Export the raw private key for the active wallet.
 *
 * Only available for OWS-managed wallets. Remote accounts do not expose raw keys.
 *
 * - Mnemonic wallets: derive key via @scure/bip32 + @scure/bip39
 * - Private-key wallets: parse the exported JSON and return the key directly
 *
 * @param chainType - "evm" or "solana"
 */
export async function getActivePrivateKey(
  chainType: ChainFamily,
): Promise<`0x${string}`> {
  const wallet = await resolveAccount(
    undefined,
    resolvePreferredChainAlias(chainType),
  );

  if (wallet.custody === "remote") {
    throw new Error(
      `Raw key export is not available for remote account "${wallet.label}".`,
    );
  }

  const passphrase = await resolveOwsPassphrase();
  return await exportOwsPrivateKey(
    wallet.label,
    chainType,
    wallet.vaultPath,
    passphrase,
  );
}
