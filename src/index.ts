import type { SubCommandsDef } from "citty";
import { defineCommand, runMain } from "citty";
import { globalArgs } from "./core/globals";
import { listProtocols } from "./protocols/registry";

const protocolCommands: SubCommandsDef = {};
for (const protocol of listProtocols()) {
  protocolCommands[protocol.name] = () => protocol.setup();
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
    ...protocolCommands,
  },
  run() {
    console.log("wooo-cli v0.1.0 — run `wooo --help` for commands");
  },
});

runMain(main);
