import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { loadPackageMeta } from "../../src/core/package-meta";

describe("loadPackageMeta", () => {
  test("loads name, version, and description from package.json", () => {
    const manifest = JSON.parse(readFileSync("package.json", "utf8")) as {
      description: string;
      name: string;
      version: string;
    };

    expect(loadPackageMeta()).toEqual({
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      packageJsonPath: expect.stringContaining("/package.json"),
    });
  });
});
