import { defineCommand } from "citty";
import { createCexCommands, resolveAuthFromConfig } from "../cex-base/commands";
import type { ProtocolDefinition } from "../types";

const resolveAuth = () => resolveAuthFromConfig("binance");
const cmds = createCexCommands("binance", resolveAuth);

export const binanceProtocol: ProtocolDefinition = {
  name: "binance",
  displayName: "Binance Exchange",
  type: "cex",
  requiresAuth: true,
  setup: () =>
    defineCommand({
      meta: { name: "binance", description: "Binance Exchange" },
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
