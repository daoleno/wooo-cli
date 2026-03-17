import { defineCommand } from "citty";

export default defineCommand({
  meta: { name: "market", description: "Aggregated market data" },
  subCommands: {
    okx: () => import("./okx").then((m) => m.default),
    price: () => import("./price").then((m) => m.default),
    search: () => import("./search").then((m) => m.default),
  },
});
