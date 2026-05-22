import { defineCommand } from "citty";

export default defineCommand({
  meta: {
    name: "secret",
    description: "Manage secret refs backed by the OS keychain",
  },
  subCommands: {
    check: () => import("./check").then((m) => m.default),
    delete: () => import("./delete").then((m) => m.default),
    set: () => import("./set").then((m) => m.default),
  },
});
