import { join } from "node:path";
import { getConfigDir } from "./config";
import {
  resolveWalletType,
  type WalletInfo,
  WalletStore,
  type WalletType,
} from "./wallet-store";

export function getWalletStore(): WalletStore {
  const password = process.env.WOOO_MASTER_PASSWORD;
  if (!password) {
    console.error("Error: Set WOOO_MASTER_PASSWORD environment variable");
    process.exit(3);
  }
  return new WalletStore(join(getConfigDir(), "keystore"), password);
}

export async function getActiveWallet(
  requiredType?: WalletType,
): Promise<WalletInfo> {
  const store = getWalletStore();
  const active = await store.getActive();
  if (!active) {
    console.error("No active wallet. Run `wooo wallet generate` first.");
    process.exit(1);
  }

  const walletType = resolveWalletType(active.chain);
  if (!walletType) {
    console.error(
      `Unsupported wallet type for "${active.name}": ${active.chain}`,
    );
    process.exit(1);
  }
  if (requiredType && walletType !== requiredType) {
    console.error(
      `Active wallet "${active.name}" is ${walletType}, but this command requires a ${requiredType} wallet.`,
    );
    process.exit(1);
  }

  return active;
}

export async function getActivePrivateKey(
  requiredType?: WalletType,
): Promise<string> {
  const active = await getActiveWallet(requiredType);
  const store = getWalletStore();
  const pk = await store.exportKey(active.name);
  if (!pk) {
    console.error("Could not retrieve wallet key");
    process.exit(1);
  }
  return pk;
}
