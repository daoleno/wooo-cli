import { defineCommand } from "citty";

export default defineCommand({
  meta: {
    name: "auth",
    description: "Configure service credentials in the OS keychain",
  },
  subCommands: {
    delete: () => import("./delete").then((m) => m.default),
    set: () => import("./set").then((m) => m.default),
    status: () => import("./status").then((m) => m.default),
  },
});
