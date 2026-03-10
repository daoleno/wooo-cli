import { defineCommand } from "citty";
import type { ProtocolDefinition } from "../types";

export const hyperliquidProtocol: ProtocolDefinition = {
  name: "hyperliquid",
  displayName: "Hyperliquid",
  type: "perps",
  chains: ["hyperliquid"],
  requiresAuth: false,
  setup: () =>
    defineCommand({
      meta: { name: "hyperliquid", description: "Hyperliquid perpetuals" },
      subCommands: {
        long: () => import("./long").then((m) => m.default),
        short: () => import("./short").then((m) => m.default),
        positions: () => import("./positions").then((m) => m.default),
        funding: () => import("./funding").then((m) => m.default),
      },
    }),
};
