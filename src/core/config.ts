import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface WoooConfig {
  default?: {
    chain?: string;
    wallet?: string;
    format?: "table" | "csv" | "json";
  };
  chains?: Record<string, { rpc?: string }>;
  [protocol: string]: unknown;
}

export const CONFIG_DEFAULTS: WoooConfig = {
  default: {
    chain: "ethereum",
    wallet: "main",
    format: "table",
  },
  chains: {
    ethereum: { rpc: "https://ethereum.publicnode.com" },
    arbitrum: { rpc: "https://arb1.arbitrum.io/rpc" },
    optimism: { rpc: "https://mainnet.optimism.io" },
    polygon: { rpc: "https://polygon-bor-rpc.publicnode.com" },
    base: { rpc: "https://mainnet.base.org" },
  },
};

export function getConfigDir(): string {
  return process.env.WOOO_CONFIG_DIR || join(homedir(), ".config", "wooo");
}

export function getConfigPath(cwd = getConfigDir()): string {
  return join(cwd, "wooo.config.json");
}

export function ensureConfigDir(cwd = getConfigDir()): void {
  if (!existsSync(cwd)) {
    mkdirSync(cwd, { recursive: true });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeConfig<T extends Record<string, unknown>>(
  defaults: T,
  overrides: Record<string, unknown>,
): T {
  const result: Record<string, unknown> = { ...defaults };

  for (const [key, value] of Object.entries(overrides)) {
    const existing = result[key];
    if (isRecord(existing) && isRecord(value)) {
      result[key] = mergeConfig(existing, value);
    } else {
      result[key] = value;
    }
  }

  return result as T;
}

function loadUserConfigSync(cwd = getConfigDir()): Record<string, unknown> {
  const configPath = getConfigPath(cwd);
  if (!existsSync(configPath)) {
    return {};
  }

  try {
    return JSON.parse(readFileSync(configPath, "utf-8")) as Record<
      string,
      unknown
    >;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid config file at ${configPath}: ${message}`);
  }
}

export function loadWoooConfigSync(cwd?: string): WoooConfig {
  const overrides = loadUserConfigSync(cwd || getConfigDir());
  return mergeConfig(CONFIG_DEFAULTS as Record<string, unknown>, overrides);
}

export async function loadWoooConfig(cwd?: string): Promise<WoooConfig> {
  return loadWoooConfigSync(cwd);
}
