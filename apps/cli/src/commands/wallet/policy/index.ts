import { defineCommand } from "citty";

export default defineCommand({
  meta: { name: "policy", description: "Manage OWS signing policies" },
  subCommands: {
    create: () => import("./create").then((m) => m.default),
    list: () => import("./list").then((m) => m.default),
    show: () => import("./show").then((m) => m.default),
    delete: () => import("./delete").then((m) => m.default),
  },
});
