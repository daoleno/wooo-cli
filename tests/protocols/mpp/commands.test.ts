import { describe, expect, test } from "bun:test";
import { mppProtocol } from "../../../src/protocols/mpp/commands";
import { DEFAULT_MAX_DEPOSIT } from "../../../src/protocols/mpp/constants";
import { createMppCallOperation } from "../../../src/protocols/mpp/operations";

describe("mpp protocol definition", () => {
  test("has correct metadata", () => {
    expect(mppProtocol.name).toBe("mpp");
    expect(mppProtocol.displayName).toBe("Machine Payments Protocol");
    expect(mppProtocol.type).toBe("payments");
    expect(mppProtocol.chains).toEqual(["tempo"]);
    expect(mppProtocol.writeAccountType).toBe("evm");
  });

  test("setup returns command with correct name", () => {
    const command = mppProtocol.setup();
    expect(command.meta?.name).toBe("mpp");
  });

  test("setup has expected subcommands", () => {
    const command = mppProtocol.setup();
    expect(command.subCommands).toBeDefined();
    const subCommandNames = Object.keys(command.subCommands ?? {});
    expect(subCommandNames).toContain("services");
    expect(subCommandNames).toContain("balance");
    expect(subCommandNames).toContain("call");
  });

  test("session subcommand is not exposed", () => {
    // Sessions require long-lived processes (daemon/agent) — not supported in CLI
    const command = mppProtocol.setup();
    const subCommandNames = Object.keys(command.subCommands ?? {});
    expect(subCommandNames).not.toContain("session");
  });
});

describe("mpp constants", () => {
  test("DEFAULT_MAX_DEPOSIT is set", () => {
    expect(DEFAULT_MAX_DEPOSIT).toBe("1.00");
  });
});

describe("mpp call operation", () => {
  test("prepare returns params unchanged", async () => {
    const params = {
      url: "https://api.example.com/data",
      method: "POST",
      body: '{"query":"test"}',
      maxDeposit: "5.00",
    };
    const op = createMppCallOperation(params);
    const prepared = await op.prepare();
    expect(prepared).toEqual(params);
  });

  test("createPreview includes all details", () => {
    const op = createMppCallOperation({
      url: "https://api.example.com/data",
      method: "POST",
      maxDeposit: "2.50",
    });
    const preview = op.createPreview({
      url: "https://api.example.com/data",
      method: "POST",
      maxDeposit: "2.50",
    });
    expect(preview.action).toContain("POST");
    expect(preview.action).toContain("https://api.example.com/data");
    expect(preview.details.maxDeposit).toBe("2.50");
    expect(preview.details.protocol).toBe("MPP (Tempo)");
  });

  test("createPreview uses defaults for optional fields", () => {
    const op = createMppCallOperation({ url: "https://example.com" });
    const preview = op.createPreview({ url: "https://example.com" });
    expect(preview.action).toContain("GET");
    expect(preview.details.method).toBe("GET");
    expect(preview.details.maxDeposit).toBe("auto");
  });

  test("createPlan returns valid execution plan", () => {
    const op = createMppCallOperation({
      url: "https://api.example.com/data",
      maxDeposit: "1.00",
    });
    const plan = op.createPlan({
      url: "https://api.example.com/data",
      maxDeposit: "1.00",
    });
    expect(plan.kind).toBe("execution-plan");
    expect(plan.version).toBe(1);
    expect(plan.operation.group).toBe("pay");
    expect(plan.operation.protocol).toBe("mpp");
    expect(plan.operation.command).toBe("call");
    expect(plan.chain).toBe("tempo");
    expect(plan.accountType).toBe("evm");
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].kind).toBe("transaction");
    expect(plan.steps[0].details.maxDeposit).toBe("1.00");
  });

  test("maxDeposit flows through prepare to plan", async () => {
    const op = createMppCallOperation({
      url: "https://example.com",
      maxDeposit: "10.00",
    });
    const prepared = await op.prepare();
    expect(prepared.maxDeposit).toBe("10.00");

    const plan = op.createPlan(prepared);
    expect(plan.steps[0].details.maxDeposit).toBe("10.00");
  });
});
