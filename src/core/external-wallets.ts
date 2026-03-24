import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ChainFamily } from "./chain-ids";
import { normalizeSignerUrl, validateSignerAuthEnv } from "./signers";

export interface RemoteAccountRecord {
  address: string;
  authEnv?: string;
  chainFamily: ChainFamily;
  label: string;
  signerUrl: string;
}

interface RegistryData {
  accounts: RemoteAccountRecord[];
}

export class RemoteAccountRegistry {
  private filePath: string;

  constructor(configDir: string) {
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    this.filePath = join(configDir, "remote-accounts.json");
  }

  private load(): RegistryData {
    if (!existsSync(this.filePath)) {
      return { accounts: [] };
    }
    const data = JSON.parse(
      readFileSync(this.filePath, "utf-8"),
    ) as RegistryData;
    return {
      accounts: (data.accounts ?? []).map((account) => this.sanitize(account)),
    };
  }

  private save(data: RegistryData): void {
    writeFileSync(this.filePath, JSON.stringify(data, null, 2));
  }

  private sanitize(account: RemoteAccountRecord): RemoteAccountRecord {
    return {
      ...account,
      signerUrl: normalizeSignerUrl(account.signerUrl),
      ...(account.authEnv
        ? { authEnv: validateSignerAuthEnv(account.authEnv) }
        : {}),
    };
  }

  list(): RemoteAccountRecord[] {
    return this.load().accounts;
  }

  get(label: string): RemoteAccountRecord | undefined {
    return this.load().accounts.find((account) => account.label === label);
  }

  add(account: RemoteAccountRecord): void {
    const data = this.load();
    const sanitizedAccount = this.sanitize(account);
    if (data.accounts.some((item) => item.label === sanitizedAccount.label)) {
      throw new Error(`Account "${sanitizedAccount.label}" already exists`);
    }
    data.accounts.push(sanitizedAccount);
    this.save(data);
  }

  remove(label: string): void {
    const data = this.load();
    const index = data.accounts.findIndex((account) => account.label === label);
    if (index === -1) {
      throw new Error(`Account "${label}" not found`);
    }
    data.accounts.splice(index, 1);
    this.save(data);
  }
}
