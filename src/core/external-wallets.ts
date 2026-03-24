import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ChainFamily } from "./chain-ids";

export interface ExternalWalletRecord {
  name: string;
  address: string;
  chainType: ChainFamily;
  broker: string;
  authEnv?: string;
}

interface RegistryData {
  wallets: ExternalWalletRecord[];
}

export class ExternalWalletRegistry {
  private filePath: string;

  constructor(configDir: string) {
    this.filePath = join(configDir, "external-wallets.json");
  }

  private load(): RegistryData {
    if (!existsSync(this.filePath)) {
      return { wallets: [] };
    }
    return JSON.parse(readFileSync(this.filePath, "utf-8")) as RegistryData;
  }

  private save(data: RegistryData): void {
    writeFileSync(this.filePath, JSON.stringify(data, null, 2));
  }

  list(): ExternalWalletRecord[] {
    return this.load().wallets;
  }

  get(name: string): ExternalWalletRecord | undefined {
    return this.load().wallets.find((w) => w.name === name);
  }

  add(wallet: ExternalWalletRecord): void {
    const data = this.load();
    if (data.wallets.some((w) => w.name === wallet.name)) {
      throw new Error(`Wallet "${wallet.name}" already exists`);
    }
    data.wallets.push(wallet);
    this.save(data);
  }

  remove(name: string): void {
    const data = this.load();
    const index = data.wallets.findIndex((w) => w.name === name);
    if (index === -1) {
      throw new Error(`Wallet "${name}" not found`);
    }
    data.wallets.splice(index, 1);
    this.save(data);
  }
}
