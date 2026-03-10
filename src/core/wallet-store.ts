import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { Keystore } from "./keystore";

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
    const pk = generatePrivateKey();
    return this.importKey(name, pk, chain);
  }

  async importKey(
    name: string,
    privateKey: string,
    chain: string,
  ): Promise<WalletInfo> {
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    await this.keystore.set(`wallet:${name}`, privateKey);
    const manifest = this.loadManifest();
    manifest.wallets = manifest.wallets.filter((w) => w.name !== name);
    manifest.wallets.push({ name, address: account.address, chain });
    if (!manifest.active) manifest.active = name;
    this.saveManifest(manifest);
    return {
      name,
      address: account.address,
      chain,
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
