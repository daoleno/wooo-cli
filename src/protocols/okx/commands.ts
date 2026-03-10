import { defineCommand } from "citty";
import { createCexCommands, resolveAuthFromConfig } from "../cex-base/commands";
import type { ProtocolDefinition } from "../types";

const resolveAuth = () => resolveAuthFromConfig("okx");
const cmds = createCexCommands("okx", resolveAuth);

export const okxProtocol: ProtocolDefinition = {
  name: "okx",
  displayName: "OKX Exchange",
  type: "cex",
  requiresAuth: true,
  setup: () =>
    defineCommand({
      meta: { name: "okx", description: "OKX Exchange" },
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
