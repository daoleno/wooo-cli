import { defineCommand } from "citty";

export default defineCommand({
  meta: { name: "wallet", description: "Manage wallets" },
  subCommands: {
    generate: () => import("./generate").then((m) => m.default),
    import: () => import("./import").then((m) => m.default),
    list: () => import("./list").then((m) => m.default),
    balance: () => import("./balance").then((m) => m.default),
    export: () => import("./export").then((m) => m.default),
    switch: () => import("./switch").then((m) => m.default),
  },
});
