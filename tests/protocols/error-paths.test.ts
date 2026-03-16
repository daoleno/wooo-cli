import { describe, expect, test } from "bun:test";
import { resolveTokenMint } from "../../src/protocols/jupiter/constants";
import { resolveToken } from "../../src/protocols/uniswap/constants";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

describe("error paths: token resolution failures", () => {
  test("Uniswap: unknown token returns undefined, not throws", () => {
    expect(resolveToken("FAKE", "ethereum")).toBeUndefined();
    expect(resolveToken("", "ethereum")).toBeUndefined();
  });

  test("Uniswap: unknown chain returns undefined", () => {
    expect(resolveToken("USDC", "solana")).toBeUndefined();
    expect(resolveToken("USDC", "")).toBeUndefined();
  });

  test("Jupiter: unknown token returns undefined", () => {
    expect(resolveTokenMint("FAKE")).toBeUndefined();
    expect(resolveTokenMint("")).toBeUndefined();
  });
});

describe("error paths: client construction without auth", () => {
  test("UniswapClient can be created without private key (for quotes)", () => {
    const { UniswapClient } = require("../../src/protocols/uniswap/client");
    const client = new UniswapClient("ethereum");
    expect(client).toBeDefined();
  });

  test("UniswapClient.swap throws without signer", async () => {
    const { UniswapClient } = require("../../src/protocols/uniswap/client");
    const client = new UniswapClient("ethereum");
    try {
      await client.swap("ETH", "USDC", 1);
      expect(true).toBe(false);
    } catch (error) {
      expect(getErrorMessage(error)).toContain("Signer required");
    }
  });

  test("LidoClient.stake throws without signer", async () => {
    const { LidoClient } = require("../../src/protocols/lido/client");
    const client = new LidoClient();
    try {
      await client.stake(1);
      expect(true).toBe(false);
    } catch (error) {
      expect(getErrorMessage(error)).toContain("Signer required");
    }
  });

  test("AaveClient.supply throws without signer", async () => {
    const { AaveClient } = require("../../src/protocols/aave/client");
    const client = new AaveClient("ethereum");
    try {
      await client.supply("USDC", 100);
      expect(true).toBe(false);
    } catch (error) {
      expect(getErrorMessage(error)).toContain("Signer required");
    }
  });

  test("JupiterClient.swap throws without signer", async () => {
    const { JupiterClient } = require("../../src/protocols/jupiter/client");
    const client = new JupiterClient();
    try {
      await client.swap("SOL", "USDC", 1);
      expect(true).toBe(false);
    } catch (error) {
      expect(getErrorMessage(error)).toContain("Signer required");
    }
  });
});

describe("error paths: invalid inputs to clients", () => {
  test("UniswapClient.quote rejects unknown token", async () => {
    const { UniswapClient } = require("../../src/protocols/uniswap/client");
    const client = new UniswapClient("ethereum");
    try {
      await client.quote("FAKECOIN", "USDC", 1);
      expect(true).toBe(false);
    } catch (error) {
      expect(getErrorMessage(error)).toContain("Unknown token");
      expect(getErrorMessage(error)).toContain("FAKECOIN");
    }
  });

  test(
    "CurveClient rejects invalid token pair",
    async () => {
      const { CurveClient } = require("../../src/protocols/curve/client");
      const client = new CurveClient("ethereum");
      // @curvefi/api throws its own error for unknown tokens
      await expect(client.quote("USDC", "FAKECOIN123", 100)).rejects.toThrow();
    },
    { timeout: 30000 },
  );
});
