import { loadConfig } from "c12";
import { join } from "node:path";
import { homedir } from "node:os";

export interface WoooConfig {
  default?: {
    chain?: string;
    wallet?: string;
    format?: "table" | "csv" | "json";
  };
  chains?: Record<string, { rpc?: string }>;
  [protocol: string]: unknown;
}

const CONFIG_DEFAULTS: WoooConfig = {
  default: {
    chain: "ethereum",
    wallet: "main",
    format: "table",
  },
  chains: {
    ethereum: { rpc: "https://eth.llamarpc.com" },
    arbitrum: { rpc: "https://arb1.arbitrum.io/rpc" },
    base: { rpc: "https://mainnet.base.org" },
  },
};

export function getConfigDir(): string {
  return process.env.WOOO_CONFIG_DIR || join(homedir(), ".config", "wooo");
}

export async function loadWoooConfig(cwd?: string): Promise<WoooConfig> {
  const configDir = cwd || getConfigDir();
  const { config } = await loadConfig<WoooConfig>({
    name: "wooo",
    cwd: configDir,
    defaults: CONFIG_DEFAULTS,
    rcFile: ".wooorc",
    packageJson: false,
  });
  return config as WoooConfig;
}
