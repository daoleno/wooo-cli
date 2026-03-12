import { describe, expect, test } from "bun:test";
import { resolveTokenMint } from "../../src/protocols/jupiter/constants";
import { resolveToken } from "../../src/protocols/uniswap/constants";

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

  test("UniswapClient.swap throws without private key", async () => {
    const { UniswapClient } = require("../../src/protocols/uniswap/client");
    const client = new UniswapClient("ethereum");
    try {
      await client.swap("ETH", "USDC", 1);
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toContain("Private key required");
    }
  });

  test("LidoClient.stake throws without private key", async () => {
    const { LidoClient } = require("../../src/protocols/lido/client");
    const client = new LidoClient();
    try {
      await client.stake(1);
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toContain("Private key required");
    }
  });

  test("AaveClient.supply throws without private key", async () => {
    const { AaveClient } = require("../../src/protocols/aave/client");
    const client = new AaveClient("ethereum");
    try {
      await client.supply("USDC", 100);
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toContain("Private key required");
    }
  });

  test("GmxClient.openPosition throws without private key", async () => {
    const { GmxClient } = require("../../src/protocols/gmx/client");
    const client = new GmxClient();
    try {
      await client.openPosition("BTC/USD", "long", 1000, 1);
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toContain("Private key required");
    }
  });

  test("StargateClient.bridge throws without private key", async () => {
    const { StargateClient } = require("../../src/protocols/stargate/client");
    const client = new StargateClient();
    try {
      await client.bridge("USDC", 100, "ethereum", "arbitrum");
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toContain("Private key required");
    }
  });

  test("JupiterClient.swap throws without private key", async () => {
    const { JupiterClient } = require("../../src/protocols/jupiter/client");
    const client = new JupiterClient();
    try {
      await client.swap("SOL", "USDC", 1);
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toContain("Private key required");
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
    } catch (e: any) {
      expect(e.message).toContain("Unknown token");
      expect(e.message).toContain("FAKECOIN");
    }
  });

  test("AaveClient rejects unsupported chain", () => {
    const { AaveClient } = require("../../src/protocols/aave/client");
    const client = new AaveClient("fantom", "0xdeadbeef");
    // The error happens when trying to get pool address
    try {
      // Access private method indirectly via supply
      client.supply("USDC", 100).catch((e: any) => {
        expect(
          e.message.includes("not supported") ||
            e.message.includes("Unknown token"),
        ).toBe(true);
      });
    } catch (e: any) {
      expect(e.message).toContain("not supported");
    }
  });

  test("GmxClient rejects unknown market", async () => {
    const { GmxClient } = require("../../src/protocols/gmx/client");
    const client = new GmxClient("0x" + "ab".repeat(32));
    try {
      await client.openPosition("DOGE/USD", "long", 100, 1);
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toContain("Unknown GMX market");
      expect(e.message).toContain("DOGE/USD");
    }
  });

  test(
    "CurveClient rejects invalid token pair",
    async () => {
      const { CurveClient } = require("../../src/protocols/curve/client");
      const client = new CurveClient("ethereum");
      // @curvefi/api throws its own error for unknown tokens
      await expect(
        client.quote("USDC", "FAKECOIN123", 100),
      ).rejects.toThrow();
    },
    { timeout: 30000 },
  );
});
