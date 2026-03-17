import { join } from "node:path";
import { getConfigDir } from "./config";
import { createEvmSigner, createSolanaSigner } from "./signers";
import {
  resolveWalletType,
  type WalletInfo,
  type WalletRecord,
  WalletStore,
  type WalletType,
} from "./wallet-store";

export function getWalletStore(): WalletStore {
  return new WalletStore(join(getConfigDir(), "keystore"));
}

async function getRequiredMasterPassword(): Promise<string> {
  const password = process.env.WOOO_MASTER_PASSWORD;
  if (password) {
    return password;
  }

  if (!process.stdin.isTTY) {
    console.error(
      "Error: Local wallet signing requires an interactive master password prompt, WOOO_MASTER_PASSWORD, or a remote signer wallet.",
    );
    process.exit(3);
  }

  const clack = await import("@clack/prompts");
  const value = await clack.password({
    message: "Enter WOOO master password:",
  });
  if (!value || typeof value === "symbol") {
    console.error("Error: No master password provided.");
    process.exit(3);
  }

  return value;
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

export async function getActiveWalletRecord(
  requiredType?: WalletType,
): Promise<WalletRecord> {
  const store = getWalletStore();
  const active = await getActiveWallet(requiredType);
  const wallet = await store.get(active.name);
  if (!wallet) {
    console.error(`Wallet "${active.name}" not found in wallet store.`);
    process.exit(1);
  }
  return wallet;
}

export async function getActiveEvmSigner() {
  const wallet = await getActiveWalletRecord("evm");
  return createEvmSigner(wallet);
}

export async function getActiveSolanaSigner() {
  const wallet = await getActiveWalletRecord("solana");
  return createSolanaSigner(wallet);
}

export async function getActiveLocalSecret(
  requiredType?: WalletType,
): Promise<string> {
  const wallet = await getActiveWalletRecord(requiredType);
  if (wallet.connection.mode !== "local") {
    console.error(
      `Wallet "${wallet.name}" is a remote signer wallet and has no local secret to export.`,
    );
    process.exit(1);
  }

  const secret = await getWalletStore().getLocalSecret(
    wallet.name,
    await getRequiredMasterPassword(),
  );
  if (!secret) {
    console.error(
      `Could not retrieve local secret for wallet "${wallet.name}".`,
    );
    process.exit(1);
  }
  return secret;
}

export async function requireMasterPassword(): Promise<string> {
  return await getRequiredMasterPassword();
}
