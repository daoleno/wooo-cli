import { defineCommand } from "citty";
import { loadWoooConfig } from "../../core/config";

export default defineCommand({
  meta: {
    name: "get",
    description: "Get a configuration value",
  },
  args: {
    key: { type: "positional", description: "Config key (e.g. default.chain)", required: true },
  },
  async run({ args }) {
    const config = await loadWoooConfig();
    const parts = args.key.split(".");
    let current: unknown = config;
    for (const part of parts) {
      if (current && typeof current === "object" && part in current) {
        current = (current as Record<string, unknown>)[part];
      } else {
        console.log(`Key "${args.key}" not found`);
        return;
      }
    }
    console.log(typeof current === "object" ? JSON.stringify(current, null, 2) : String(current));
  },
});
