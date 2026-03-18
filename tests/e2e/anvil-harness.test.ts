import { afterEach, describe, expect, test } from "bun:test";
import { parseForkUrlList, resolveForkUrls } from "./anvil-harness";

const ENV_KEYS = [
  "ANVIL_FORK_URLS_ETHEREUM",
  "ANVIL_FORK_URL_ETHEREUM",
] as const;

const ORIGINAL_ENV = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof ENV_KEYS)[number], string | undefined>;

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = ORIGINAL_ENV[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("anvil harness fork URL resolution", () => {
  test("parseForkUrlList accepts whitespace, commas, and newlines", () => {
    expect(
      parseForkUrlList(`
        https://rpc-1.example.com,
        https://rpc-2.example.com https://rpc-3.example.com
      `),
    ).toEqual([
      "https://rpc-1.example.com",
      "https://rpc-2.example.com",
      "https://rpc-3.example.com",
    ]);
  });

  test("resolveForkUrls prefers the list env over the single URL env", () => {
    process.env.ANVIL_FORK_URLS_ETHEREUM =
      "https://rpc-a.example.com https://rpc-b.example.com";
    process.env.ANVIL_FORK_URL_ETHEREUM = "https://rpc-single.example.com";

    expect(
      resolveForkUrls({
        chainId: 1,
        chainName: "ethereum",
        configDirPrefix: "test-",
        defaultForkUrl: "https://rpc-default.example.com",
        forkBlockNumberEnvKey: "ANVIL_FORK_BLOCK_NUMBER",
        forkUrlsEnvKey: "ANVIL_FORK_URLS_ETHEREUM",
        forkUrlEnvKey: "ANVIL_FORK_URL_ETHEREUM",
        walletName: "test-wallet",
      }),
    ).toEqual(["https://rpc-a.example.com", "https://rpc-b.example.com"]);
  });

  test("resolveForkUrls falls back to the single URL env and then the default", () => {
    delete process.env.ANVIL_FORK_URLS_ETHEREUM;
    process.env.ANVIL_FORK_URL_ETHEREUM = "https://rpc-single.example.com";

    expect(
      resolveForkUrls({
        chainId: 1,
        chainName: "ethereum",
        configDirPrefix: "test-",
        defaultForkUrl: "https://rpc-default.example.com",
        forkBlockNumberEnvKey: "ANVIL_FORK_BLOCK_NUMBER",
        forkUrlsEnvKey: "ANVIL_FORK_URLS_ETHEREUM",
        forkUrlEnvKey: "ANVIL_FORK_URL_ETHEREUM",
        walletName: "test-wallet",
      }),
    ).toEqual(["https://rpc-single.example.com"]);

    delete process.env.ANVIL_FORK_URL_ETHEREUM;

    expect(
      resolveForkUrls({
        chainId: 1,
        chainName: "ethereum",
        configDirPrefix: "test-",
        defaultForkUrl: "https://rpc-default.example.com",
        forkBlockNumberEnvKey: "ANVIL_FORK_BLOCK_NUMBER",
        forkUrlsEnvKey: "ANVIL_FORK_URLS_ETHEREUM",
        forkUrlEnvKey: "ANVIL_FORK_URL_ETHEREUM",
        walletName: "test-wallet",
      }),
    ).toEqual(["https://rpc-default.example.com"]);
  });
});
