import { defineCommand } from "citty";

export default defineCommand({
  meta: { name: "market", description: "Aggregated market data" },
  subCommands: {
    price: () => import("./price").then((m) => m.default),
    search: () => import("./search").then((m) => m.default),
  },
});
