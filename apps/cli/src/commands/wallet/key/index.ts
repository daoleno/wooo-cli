import { defineCommand } from "citty";

export default defineCommand({
  meta: { name: "key", description: "Manage OWS API keys for agent access" },
  subCommands: {
    create: () => import("./create").then((m) => m.default),
    list: () => import("./list").then((m) => m.default),
    revoke: () => import("./revoke").then((m) => m.default),
  },
});
