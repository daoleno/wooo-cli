import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  platform: "node",
  splitting: true,
  minify: true,
  deps: {
    neverBundle: [
      "ccxt",
      "@open-wallet-standard/core",
      "@napi-rs/keyring",
    ],
    onlyAllowBundle: false,
  },
});
