import { describe, expect, test } from "bun:test";
import { DEFAULT_CHAIN } from "../../../src/protocols/x402/constants";
import { createX402CallOperation } from "../../../src/protocols/x402/operations";

describe("x402 call operation", () => {
  test("prepare returns params unchanged", async () => {
    const params = {
      url: "https://api.example.com/data",
      method: "POST",
      body: '{"query":"test"}',
      chain: "ethereum",
    };
    const op = createX402CallOperation(params);
    const prepared = await op.prepare();
    expect(prepared).toEqual(params);
  });

  test("createPreview includes all details", () => {
    const op = createX402CallOperation({
      url: "https://api.example.com/data",
      method: "POST",
      chain: "ethereum",
    });
    const preview = op.createPreview({
      url: "https://api.example.com/data",
      method: "POST",
      chain: "ethereum",
    });
    expect(preview.action).toContain("POST");
    expect(preview.action).toContain("https://api.example.com/data");
    expect(preview.details.chain).toBe("ethereum");
    expect(preview.details.protocol).toBe("x402");
  });

  test("createPreview uses defaults for optional fields", () => {
    const op = createX402CallOperation({ url: "https://example.com" });
    const preview = op.createPreview({ url: "https://example.com" });
    expect(preview.action).toContain("GET");
    expect(preview.details.method).toBe("GET");
    expect(preview.details.chain).toBe(DEFAULT_CHAIN);
  });

  test("createPlan returns valid execution plan", () => {
    const op = createX402CallOperation({
      url: "https://api.example.com/data",
      chain: "base",
    });
    const plan = op.createPlan({
      url: "https://api.example.com/data",
      chain: "base",
    });
    expect(plan.kind).toBe("execution-plan");
    expect(plan.version).toBe(1);
    expect(plan.operation.group).toBe("pay");
    expect(plan.operation.protocol).toBe("x402");
    expect(plan.operation.command).toBe("call");
    expect(plan.chain).toBe("base");
    expect(plan.accountType).toBe("evm");
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].kind).toBe("transaction");
    expect(plan.steps[0].title).toContain("EIP-712");
  });

  test("chain defaults to base when not specified", () => {
    const op = createX402CallOperation({ url: "https://example.com" });
    const plan = op.createPlan({ url: "https://example.com" });
    expect(plan.chain).toBe("base");
  });
});
