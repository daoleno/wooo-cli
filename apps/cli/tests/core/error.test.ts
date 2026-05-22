import { describe, expect, test } from "bun:test";
import { ExitCode, formatError, WoooError } from "../../src/core/error";

describe("WoooError", () => {
  test("creates error with exit code", () => {
    const err = new WoooError("bad input", ExitCode.ARGUMENT_ERROR);
    expect(err.message).toBe("bad input");
    expect(err.exitCode).toBe(2);
    expect(err.name).toBe("WoooError");
  });

  test("creates error with details", () => {
    const err = new WoooError("insufficient balance", ExitCode.TRADE_REJECTED, {
      required: 1000,
      available: 500,
    });
    expect(err.details).toEqual({ required: 1000, available: 500 });
  });
});

describe("formatError", () => {
  test("returns JSON object for json mode", () => {
    const err = new WoooError("auth failed", ExitCode.AUTH_FAILURE);
    const result = formatError(err, true);
    const parsed = JSON.parse(result);
    expect(parsed).toEqual({ error: "auth failed", code: 3 });
  });

  test("returns JSON with details when present", () => {
    const err = new WoooError("bad balance", ExitCode.TRADE_REJECTED, {
      required: 1000,
    });
    const result = formatError(err, true);
    const parsed = JSON.parse(result);
    expect(parsed.details).toEqual({ required: 1000 });
  });

  test("returns plain message for non-json mode", () => {
    const err = new WoooError("something broke", ExitCode.GENERAL_ERROR);
    const result = formatError(err, false);
    expect(result).toContain("something broke");
  });
});
