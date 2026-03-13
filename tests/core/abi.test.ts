import { describe, expect, test } from "bun:test";
import {
  parseAbiArgument,
  parseAbiArguments,
  splitAbiTypes,
  splitCallArguments,
} from "../../src/core/abi";

describe("ABI argument parsing", () => {
  test("splits top-level ABI types", () => {
    expect(splitAbiTypes("address,uint256,bool")).toEqual([
      "address",
      "uint256",
      "bool",
    ]);
  });

  test("splits top-level call arguments while preserving arrays", () => {
    expect(
      splitCallArguments(
        '0x0000000000000000000000000000000000000001,[1,2,3],"hello,world"',
      ),
    ).toEqual([
      "0x0000000000000000000000000000000000000001",
      "[1,2,3]",
      '"hello,world"',
    ]);
  });

  test("parses primitive ABI arguments", () => {
    expect(parseAbiArgument("bool", "true")).toBe(true);
    expect(parseAbiArgument("uint256", "42")).toBe(42n);
    expect(parseAbiArgument("string", '"hello"')).toBe("hello");
  });

  test("parses array ABI arguments", () => {
    expect(parseAbiArgument("uint256[]", "[1,2,3]")).toEqual([1n, 2n, 3n]);
    expect(
      parseAbiArgument(
        "address[2]",
        "[0x0000000000000000000000000000000000000001,0x0000000000000000000000000000000000000002]",
      ),
    ).toEqual([
      "0x0000000000000000000000000000000000000001",
      "0x0000000000000000000000000000000000000002",
    ]);
  });

  test("parses ABI argument lists with type-aware conversion", () => {
    expect(
      parseAbiArguments(
        "address,uint256,bool,string",
        '0x0000000000000000000000000000000000000001,42,true,"gm"',
      ),
    ).toEqual(["0x0000000000000000000000000000000000000001", 42n, true, "gm"]);
  });

  test("rejects invalid argument counts", () => {
    expect(() => parseAbiArguments("uint256,bool", "1")).toThrow(
      "Expected 2 argument(s) but received 1",
    );
  });
});
