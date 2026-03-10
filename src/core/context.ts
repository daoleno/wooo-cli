import { WalletStore } from "./wallet-store";
import { getConfigDir } from "./config";
import { join } from "node:path";

export function getWalletStore(): WalletStore {
  const password = process.env.WOOO_MASTER_PASSWORD;
  if (!password) {
    console.error("Error: Set WOOO_MASTER_PASSWORD environment variable");
    process.exit(3);
  }
  return new WalletStore(join(getConfigDir(), "keystore"), password);
}

export async function getActivePrivateKey(): Promise<string> {
  const store = getWalletStore();
  const active = await store.getActive();
  if (!active) {
    console.error("No active wallet. Run `wooo wallet generate` first.");
    process.exit(1);
  }
  const pk = await store.exportKey(active.name);
  if (!pk) {
    console.error("Could not retrieve wallet key");
    process.exit(1);
  }
  return pk;
}
