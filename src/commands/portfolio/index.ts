import { defineCommand } from "citty";

export default defineCommand({
  meta: { name: "portfolio", description: "Cross-protocol portfolio overview" },
  subCommands: {
    overview: () => import("./overview").then((m) => m.default),
  },
});
