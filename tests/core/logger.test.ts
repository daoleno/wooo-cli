import { describe, expect, spyOn, test } from "bun:test";
import { createLogger, LogLevel } from "../../src/core/logger";

describe("createLogger", () => {
  test("debug logs to stderr when verbose", () => {
    const spy = spyOn(process.stderr, "write").mockImplementation(() => true);
    const logger = createLogger(LogLevel.DEBUG);
    logger.debug("test message");
    expect(spy).toHaveBeenCalled();
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain("test message");
    spy.mockRestore();
  });

  test("debug does not log when level is info", () => {
    const spy = spyOn(process.stderr, "write").mockImplementation(() => true);
    const logger = createLogger(LogLevel.INFO);
    logger.debug("hidden");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("quiet suppresses info", () => {
    const spy = spyOn(process.stderr, "write").mockImplementation(() => true);
    const logger = createLogger(LogLevel.QUIET);
    logger.info("hidden");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("error always logs even when quiet", () => {
    const spy = spyOn(process.stderr, "write").mockImplementation(() => true);
    const logger = createLogger(LogLevel.QUIET);
    logger.error("critical");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
