import { existsSync, writeFileSync } from "node:fs";
import { defineCommand } from "citty";
import {
  CONFIG_DEFAULTS,
  ensureConfigDir,
  getConfigDir,
  getConfigPath,
} from "../../core/config";

export default defineCommand({
  meta: {
    name: "init",
    description: "Initialize wooo-cli configuration",
  },
  run() {
    const configDir = getConfigDir();
    ensureConfigDir(configDir);
    const configPath = getConfigPath(configDir);
    if (existsSync(configPath)) {
      console.log(`Config already exists at ${configPath}`);
      return;
    }
    writeFileSync(configPath, JSON.stringify(CONFIG_DEFAULTS, null, 2));
    console.log(`Config created at ${configPath}`);
  },
});
