import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Keystore } from "../../src/core/keystore";

describe("Keystore", () => {
  let tempDir: string;
  let keystore: Keystore;
  const password = "a-very-secure-master-password-32ch";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "wooo-keystore-test-"));
    keystore = new Keystore(tempDir, password);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("stores and retrieves a secret", async () => {
    await keystore.set("wallet:main", "0xdeadbeef1234");
    const value = await keystore.get("wallet:main");
    expect(value).toBe("0xdeadbeef1234");
  });

  test("returns null for non-existent key", async () => {
    const value = await keystore.get("wallet:nope");
    expect(value).toBeNull();
  });

  test("deletes a secret", async () => {
    await keystore.set("wallet:temp", "secret");
    await keystore.delete("wallet:temp");
    const value = await keystore.get("wallet:temp");
    expect(value).toBeNull();
  });

  test("lists stored keys", async () => {
    await keystore.set("wallet:a", "val-a");
    await keystore.set("wallet:b", "val-b");
    const keys = await keystore.list();
    expect(keys).toContain("wallet:a");
    expect(keys).toContain("wallet:b");
  });

  test("encrypted data differs from plaintext", async () => {
    await keystore.set("wallet:test", "0xdeadbeef");
    const files = readdirSync(tempDir);
    const content = readFileSync(join(tempDir, files[0]), "utf-8");
    expect(content).not.toContain("0xdeadbeef");
  });
});
