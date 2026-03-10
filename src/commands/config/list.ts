import { defineCommand } from "citty";
import { loadWoooConfig } from "../../core/config";

export default defineCommand({
  meta: {
    name: "list",
    description: "List all configuration values",
  },
  async run() {
    const config = await loadWoooConfig();
    console.log(JSON.stringify(config, null, 2));
  },
});
