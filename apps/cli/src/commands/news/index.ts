import { defineCommand } from "citty";

export default defineCommand({
  meta: {
    name: "news",
    description: "Crypto news and sentiment data",
  },
  subCommands: {
    okx: () => import("./okx").then((m) => m.default),
  },
});
