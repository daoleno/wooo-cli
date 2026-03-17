import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { Keystore } from "./keystore";
import type { WalletMode } from "./signer-protocol";
import { getSolanaKeypair } from "./solana";

export type WalletType = "evm" | "solana";
export type RemoteSignerTransport = "command" | "service";

export interface LocalWalletConnection {
  keyRef: string;
  mode: "local";
}

export interface RemoteCommandWalletConnection {
  command: string[];
  mode: "remote";
  transport: "command";
}

export interface RemoteServiceWalletConnection {
  mode: "remote";
  transport: "service";
  url: string;
}

export type RemoteWalletConnection =
  | RemoteCommandWalletConnection
  | RemoteServiceWalletConnection;

export interface RemoteCommandWalletConfig {
  command: string[];
  transport: "command";
}

export interface RemoteServiceWalletConfig {
  transport: "service";
  url: string;
}

export type RemoteWalletConfig =
  | RemoteCommandWalletConfig
  | RemoteServiceWalletConfig;

export type WalletConnection = LocalWalletConnection | RemoteWalletConnection;

export interface WalletRecord {
  address: string;
  chain: string;
  connection: WalletConnection;
  name: string;
}

export interface WalletInfo {
  active: boolean;
  address: string;
  chain: string;
  mode: WalletMode;
  name: string;
  transport?: RemoteSignerTransport;
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
    mode: wallet.connection.mode,
    ...(wallet.connection.mode === "remote"
      ? { transport: wallet.connection.transport }
      : {}),
    active: activeName === wallet.name,
  };
}

function toRemoteWalletConnection(
  connection: RemoteWalletConfig,
): RemoteWalletConnection {
  if (connection.transport === "command") {
    if (connection.command.length === 0) {
      throw new Error("Signer command cannot be empty");
    }

    return {
      mode: "remote",
      transport: "command",
      command: [...connection.command],
    };
  }

  if (!connection.url.trim()) {
    throw new Error("Signer service URL cannot be empty");
  }

  return {
    mode: "remote",
    transport: "service",
    url: connection.url.trim(),
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
      connection: {
        mode: "local",
        keyRef,
      },
    });
  }

  async connectRemoteWallet(
    name: string,
    address: string,
    chain: string,
    connection: RemoteWalletConfig,
  ): Promise<WalletInfo> {
    const walletType = resolveWalletType(chain);
    if (!walletType) {
      throw new Error(`Unsupported wallet type: ${chain}`);
    }

    return this.upsertWallet({
      name,
      address: address.trim(),
      chain: walletType,
      connection: toRemoteWalletConnection(connection),
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
    if (wallet.connection.mode !== "local") {
      throw new Error(`Wallet "${name}" is not a local wallet`);
    }
    return this.getKeystore(password).get(wallet.connection.keyRef);
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
