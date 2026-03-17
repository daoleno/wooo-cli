import { defineCommand } from "citty";

export default defineCommand({
  meta: { name: "chain", description: "On-chain operations" },
  subCommands: {
    okx: () => import("./okx").then((m) => m.default),
    tx: () => import("./tx").then((m) => m.default),
    balance: () => import("./balance").then((m) => m.default),
    ens: () => import("./ens").then((m) => m.default),
    call: () => import("./call").then((m) => m.default),
  },
});
