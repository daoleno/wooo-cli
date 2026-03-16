import { defineCommand } from "citty";

export default defineCommand({
  meta: { name: "wallet", description: "Manage wallets" },
  subCommands: {
    "__local-signer": () => import("./__local-signer").then((m) => m.default),
    connect: () => import("./connect").then((m) => m.default),
    discover: () => import("./discover").then((m) => m.default),
    generate: () => import("./generate").then((m) => m.default),
    import: () => import("./import").then((m) => m.default),
    list: () => import("./list").then((m) => m.default),
    balance: () => import("./balance").then((m) => m.default),
    switch: () => import("./switch").then((m) => m.default),
  },
});
