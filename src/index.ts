import type { SubCommandsDef } from "citty";
import { defineCommand, runMain } from "citty";
import { globalArgs } from "./core/globals";
import { listProtocolsByGroup } from "./protocols/registry";
import {
  PROTOCOL_GROUP_DESCRIPTIONS,
  type ProtocolGroup,
} from "./protocols/types";

// Build group commands: wooo cex okx ..., wooo perps hyperliquid ..., etc.
const groupCommands: SubCommandsDef = {};
const groups = listProtocolsByGroup();

for (const [group, protocols] of Object.entries(groups)) {
  if (protocols.length === 0) continue;

  const subCommands: SubCommandsDef = {};
  for (const protocol of protocols) {
    subCommands[protocol.name] = () => protocol.setup();
  }

  groupCommands[group] = () =>
    defineCommand({
      meta: {
        name: group,
        description: PROTOCOL_GROUP_DESCRIPTIONS[group as ProtocolGroup],
      },
      subCommands,
    });
}

const main = defineCommand({
  meta: {
    name: "wooo",
    version: "0.1.0",
    description: "Crypto All-in-One CLI",
  },
  args: globalArgs,
  subCommands: {
    config: () => import("./commands/config/index").then((m) => m.default),
    wallet: () => import("./commands/wallet/index").then((m) => m.default),
    market: () => import("./commands/market/index").then((m) => m.default),
    portfolio: () =>
      import("./commands/portfolio/index").then((m) => m.default),
    chain: () => import("./commands/chain/index").then((m) => m.default),
    swap: () => import("./commands/swap/index").then((m) => m.default),
    ...groupCommands,
  },
  run({ rawArgs }) {
    const hasSubcommand = rawArgs.some((arg) => !arg.startsWith("-"));
    if (!hasSubcommand) {
      console.log("wooo-cli v0.1.0 — run `wooo --help` for commands");
    }
  },
});

runMain(main);
