import { defineCommand, runMain } from "citty";
import { globalArgs } from "./core/globals";

const main = defineCommand({
  meta: {
    name: "wooo",
    version: "0.1.0",
    description: "Crypto All-in-One CLI",
  },
  args: globalArgs,
  subCommands: {
    config: () => import("./commands/config/index").then((m) => m.default),
  },
  run() {
    console.log("wooo-cli v0.1.0 — run `wooo --help` for commands");
  },
});

runMain(main);
