import { describe, expect, test } from "bun:test";
import { x402Protocol } from "../../../src/protocols/x402/commands";

describe("x402 protocol definition", () => {
  test("has correct metadata", () => {
    expect(x402Protocol.name).toBe("x402");
    expect(x402Protocol.displayName).toBe("x402 Payment Protocol");
    expect(x402Protocol.type).toBe("payments");
    expect(x402Protocol.chains).toEqual(["base", "ethereum", "polygon"]);
    expect(x402Protocol.writeAccountType).toBe("evm");
  });

  test("setup returns command with correct name", () => {
    const command = x402Protocol.setup();
    expect(command.meta?.name).toBe("x402");
  });

  test("setup has expected subcommands", () => {
    const command = x402Protocol.setup();
    expect(command.subCommands).toBeDefined();
    const subCommandNames = Object.keys(command.subCommands ?? {});
    expect(subCommandNames).toContain("call");
    expect(subCommandNames).toContain("balance");
  });
});
