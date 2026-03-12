import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { defineCommand } from "citty";
import { ensureConfigDir, getConfigPath } from "../../core/config";

export default defineCommand({
  meta: {
    name: "set",
    description: "Set a configuration value",
  },
  args: {
    key: {
      type: "positional",
      description: "Config key (e.g. default.chain)",
      required: true,
    },
    value: { type: "positional", description: "Config value", required: true },
  },
  run({ args }) {
    ensureConfigDir();
    const configPath = getConfigPath();
    let config: Record<string, unknown> = {};
    if (existsSync(configPath)) {
      config = JSON.parse(readFileSync(configPath, "utf-8"));
    }
    const parts = args.key.split(".");
    let current: Record<string, unknown> = config;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in current) || typeof current[parts[i]] !== "object") {
        current[parts[i]] = {};
      }
      current = current[parts[i]] as Record<string, unknown>;
    }
    current[parts[parts.length - 1]] = args.value;
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(`Set ${args.key} = ${args.value}`);
  },
});
