import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { Keystore } from "./keystore";
import type { WalletAuthKind } from "./signer-protocol";
import { getSolanaKeypair } from "./solana";

export type WalletType = "evm" | "solana";

export interface CommandWalletAuthConfig {
  command: string[];
  kind: "command";
}

export interface ServiceWalletAuthConfig {
  kind: "service";
  url: string;
}

export interface LocalKeystoreWalletAuthConfig {
  keyRef: string;
  kind: "local-keystore";
}

export type WalletAuthConfig =
  | CommandWalletAuthConfig
  | LocalKeystoreWalletAuthConfig
  | ServiceWalletAuthConfig;

export interface WalletRecord {
  address: string;
  auth: WalletAuthConfig;
  chain: string;
  name: string;
}

export interface WalletInfo {
  active: boolean;
  address: string;
  authKind: WalletAuthKind;
  chain: string;
  name: string;
}

interface WalletManifest {
  active: string | null;
  wallets: WalletRecord[];
}

const EVM_WALLET_ALIASES = new Set([
  "evm",
  "ethereum",
  "arbitrum",
  "optimism",
  "polygon",
  "base",
]);

export function resolveWalletType(chain: string): WalletType | null {
  const normalized = chain.trim().toLowerCase();
  if (normalized === "solana") {
    return "solana";
  }
  if (EVM_WALLET_ALIASES.has(normalized)) {
    return "evm";
  }
  return null;
}

function toWalletInfo(
  wallet: WalletRecord,
  activeName: string | null,
): WalletInfo {
  return {
    name: wallet.name,
    address: wallet.address,
    chain: wallet.chain,
    authKind: wallet.auth.kind,
    active: activeName === wallet.name,
  };
}

export class WalletStore {
  private keystoreDir: string;
  private manifestPath: string;

  constructor(dir: string) {
    this.keystoreDir = join(dir, "keys");
    this.manifestPath = join(dir, "wallets.json");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  private getKeystore(password: string): Keystore {
    return new Keystore(this.keystoreDir, password);
  }

  private loadManifest(): WalletManifest {
    if (!existsSync(this.manifestPath)) {
      return { wallets: [], active: null };
    }
    return JSON.parse(
      readFileSync(this.manifestPath, "utf-8"),
    ) as WalletManifest;
  }

  private saveManifest(manifest: WalletManifest): void {
    writeFileSync(this.manifestPath, JSON.stringify(manifest, null, 2));
  }

  private upsertWallet(record: WalletRecord): WalletInfo {
    const manifest = this.loadManifest();
    manifest.wallets = manifest.wallets.filter(
      (wallet) => wallet.name !== record.name,
    );
    manifest.wallets.push(record);
    if (!manifest.active) {
      manifest.active = record.name;
    }
    this.saveManifest(manifest);
    return toWalletInfo(record, manifest.active);
  }

  async generate(
    name: string,
    chain: string,
    password: string,
  ): Promise<WalletInfo> {
    const walletType = resolveWalletType(chain);
    if (!walletType) {
      throw new Error(`Unsupported wallet type: ${chain}`);
    }

    if (walletType === "solana") {
      const keypair = Keypair.generate();
      const secretKey = bs58.encode(keypair.secretKey);
      return this.importKey(name, secretKey, walletType, password);
    }

    return this.importKey(name, generatePrivateKey(), walletType, password);
  }

  async importKey(
    name: string,
    privateKey: string,
    chain: string,
    password: string,
  ): Promise<WalletInfo> {
    const walletType = resolveWalletType(chain);
    if (!walletType) {
      throw new Error(`Unsupported wallet type: ${chain}`);
    }

    const secret = privateKey.trim();
    let address: string;
    let storedSecret = secret;

    if (walletType === "solana") {
      const keypair = getSolanaKeypair(secret);
      address = keypair.publicKey.toBase58();
      storedSecret = bs58.encode(keypair.secretKey);
    } else {
      address = privateKeyToAccount(secret as `0x${string}`).address;
    }

    const keyRef = `wallet:${name}`;
    await this.getKeystore(password).set(keyRef, storedSecret);

    return this.upsertWallet({
      name,
      address,
      chain: walletType,
      auth: {
        kind: "local-keystore",
        keyRef,
      },
    });
  }

  async connectCommandWallet(
    name: string,
    address: string,
    chain: string,
    command: string[],
  ): Promise<WalletInfo> {
    const walletType = resolveWalletType(chain);
    if (!walletType) {
      throw new Error(`Unsupported wallet type: ${chain}`);
    }
    if (command.length === 0) {
      throw new Error("Signer command cannot be empty");
    }

    return this.upsertWallet({
      name,
      address: address.trim(),
      chain: walletType,
      auth: {
        kind: "command",
        command,
      },
    });
  }

  async connectServiceWallet(
    name: string,
    address: string,
    chain: string,
    url: string,
  ): Promise<WalletInfo> {
    const walletType = resolveWalletType(chain);
    if (!walletType) {
      throw new Error(`Unsupported wallet type: ${chain}`);
    }
    if (!url.trim()) {
      throw new Error("Signer service URL cannot be empty");
    }

    return this.upsertWallet({
      name,
      address: address.trim(),
      chain: walletType,
      auth: {
        kind: "service",
        url: url.trim(),
      },
    });
  }

  async list(): Promise<WalletInfo[]> {
    const manifest = this.loadManifest();
    return manifest.wallets.map((wallet) =>
      toWalletInfo(wallet, manifest.active),
    );
  }

  async get(name: string): Promise<WalletRecord | null> {
    const manifest = this.loadManifest();
    return manifest.wallets.find((wallet) => wallet.name === name) ?? null;
  }

  async getActive(): Promise<WalletInfo | null> {
    const manifest = this.loadManifest();
    if (!manifest.active) {
      return null;
    }
    const wallet = manifest.wallets.find(
      (item) => item.name === manifest.active,
    );
    return wallet ? toWalletInfo(wallet, manifest.active) : null;
  }

  async getActiveRecord(): Promise<WalletRecord | null> {
    const active = await this.getActive();
    if (!active) {
      return null;
    }
    return this.get(active.name);
  }

  async getLocalSecret(name: string, password: string): Promise<string | null> {
    const wallet = await this.get(name);
    if (!wallet) {
      return null;
    }
    if (wallet.auth.kind !== "local-keystore") {
      throw new Error(`Wallet "${name}" does not use local keystore auth`);
    }
    return this.getKeystore(password).get(wallet.auth.keyRef);
  }

  async setActive(name: string): Promise<void> {
    const manifest = this.loadManifest();
    if (!manifest.wallets.some((wallet) => wallet.name === name)) {
      throw new Error(`Wallet "${name}" not found`);
    }
    manifest.active = name;
    this.saveManifest(manifest);
  }
}
