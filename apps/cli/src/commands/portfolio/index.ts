import { defineCommand } from "citty";

export default defineCommand({
  meta: { name: "portfolio", description: "Cross-protocol portfolio overview" },
  subCommands: {
    okx: () => import("./okx").then((m) => m.default),
    overview: () => import("./overview").then((m) => m.default),
  },
});
