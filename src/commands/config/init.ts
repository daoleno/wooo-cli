import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defineCommand } from "citty";
import { getConfigDir } from "../../core/config";

export default defineCommand({
  meta: {
    name: "init",
    description: "Initialize wooo-cli configuration",
  },
  run() {
    const configDir = getConfigDir();
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    const configPath = join(configDir, "wooo.config.json");
    if (existsSync(configPath)) {
      console.log(`Config already exists at ${configPath}`);
      return;
    }
    const defaultConfig = {
      default: { chain: "ethereum", wallet: "main", format: "table" },
      chains: {
        ethereum: { rpc: "https://eth.llamarpc.com" },
        arbitrum: { rpc: "https://arb1.arbitrum.io/rpc" },
        base: { rpc: "https://mainnet.base.org" },
      },
    };
    writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    console.log(`Config created at ${configPath}`);
  },
});
