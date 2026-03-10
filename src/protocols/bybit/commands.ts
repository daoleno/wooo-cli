import { defineCommand } from "citty";
import { createCexCommands, resolveAuthFromConfig } from "../cex-base/commands";
import type { ProtocolDefinition } from "../types";

const resolveAuth = () => resolveAuthFromConfig("bybit");
const cmds = createCexCommands("bybit", resolveAuth);

export const bybitProtocol: ProtocolDefinition = {
  name: "bybit",
  displayName: "Bybit Exchange",
  type: "cex",
  requiresAuth: true,
  setup: () =>
    defineCommand({
      meta: { name: "bybit", description: "Bybit Exchange" },
      subCommands: {
        buy: () => Promise.resolve(cmds.spotBuy),
        sell: () => Promise.resolve(cmds.spotSell),
        long: () => Promise.resolve(cmds.futuresLong),
        short: () => Promise.resolve(cmds.futuresShort),
        balance: () => Promise.resolve(cmds.balance),
        positions: () => Promise.resolve(cmds.positions),
      },
    }),
};
