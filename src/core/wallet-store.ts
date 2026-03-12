import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { Keystore } from "./keystore";
import { getSolanaKeypair } from "./solana";

export type WalletType = "evm" | "solana";

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

export interface WalletInfo {
  name: string;
  address: string;
  chain: string;
  active: boolean;
}

interface WalletManifest {
  wallets: Array<{ name: string; address: string; chain: string }>;
  active: string | null;
}

export class WalletStore {
  private keystore: Keystore;
  private manifestPath: string;

  constructor(dir: string, password: string) {
    const keystoreDir = join(dir, "keys");
    this.keystore = new Keystore(keystoreDir, password);
    this.manifestPath = join(dir, "wallets.json");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  private loadManifest(): WalletManifest {
    if (!existsSync(this.manifestPath)) return { wallets: [], active: null };
    return JSON.parse(readFileSync(this.manifestPath, "utf-8"));
  }

  private saveManifest(manifest: WalletManifest): void {
    writeFileSync(this.manifestPath, JSON.stringify(manifest, null, 2));
  }

  async generate(name: string, chain: string): Promise<WalletInfo> {
    const walletType = resolveWalletType(chain);
    if (!walletType) {
      throw new Error(`Unsupported wallet type: ${chain}`);
    }

    if (walletType === "solana") {
      const keypair = Keypair.generate();
      const secretKey = bs58.encode(keypair.secretKey);
      return this.importKey(name, secretKey, walletType);
    }

    const pk = generatePrivateKey();
    return this.importKey(name, pk, walletType);
  }

  async importKey(
    name: string,
    privateKey: string,
    chain: string,
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
      const account = privateKeyToAccount(secret as `0x${string}`);
      address = account.address;
    }

    await this.keystore.set(`wallet:${name}`, storedSecret);

    const manifest = this.loadManifest();
    manifest.wallets = manifest.wallets.filter((w) => w.name !== name);
    manifest.wallets.push({ name, address, chain: walletType });
    if (!manifest.active) manifest.active = name;
    this.saveManifest(manifest);
    return {
      name,
      address,
      chain: walletType,
      active: manifest.active === name,
    };
  }

  async list(): Promise<WalletInfo[]> {
    const manifest = this.loadManifest();
    return manifest.wallets.map((w) => ({
      ...w,
      active: manifest.active === w.name,
    }));
  }

  async exportKey(name: string): Promise<string | null> {
    return this.keystore.get(`wallet:${name}`);
  }

  async setActive(name: string): Promise<void> {
    const manifest = this.loadManifest();
    if (!manifest.wallets.some((w) => w.name === name))
      throw new Error(`Wallet "${name}" not found`);
    manifest.active = name;
    this.saveManifest(manifest);
  }

  async getActive(): Promise<WalletInfo | null> {
    const manifest = this.loadManifest();
    if (!manifest.active) return null;
    const wallet = manifest.wallets.find((w) => w.name === manifest.active);
    if (!wallet) return null;
    return { ...wallet, active: true };
  }
}
