import { defineCommand, runMain } from "citty";

const main = defineCommand({
  meta: {
    name: "wooo",
    version: "0.1.0",
    description: "Crypto All-in-One CLI",
  },
  run() {
    console.log("wooo-cli v0.1.0 — run `wooo --help` for commands");
  },
});

runMain(main);
