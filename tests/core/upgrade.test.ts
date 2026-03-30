import { describe, expect, test } from "bun:test";
import {
  buildUpgradeCommandSpec,
  checkForUpgrade,
  resolveUpgradeManager,
  runUpgradeInstall,
} from "../../src/core/upgrade";

describe("resolveUpgradeManager", () => {
  test("defaults to npm when no package manager hint is available", () => {
    expect(resolveUpgradeManager(undefined, {} as NodeJS.ProcessEnv)).toBe(
      "npm",
    );
  });

  test("detects pnpm from npm user agent", () => {
    expect(
      resolveUpgradeManager(undefined, {
        npm_config_user_agent: "pnpm/10.0.0 npm/? node/v22.0.0 linux x64",
      }),
    ).toBe("pnpm");
  });

  test("accepts explicit supported managers", () => {
    expect(resolveUpgradeManager("yarn")).toBe("yarn");
  });

  test("rejects unsupported managers", () => {
    expect(() => resolveUpgradeManager("brew")).toThrow(
      "Unsupported package manager",
    );
  });
});

describe("buildUpgradeCommandSpec", () => {
  test("builds npm install commands", () => {
    expect(
      buildUpgradeCommandSpec({
        manager: "npm",
        packageName: "wooo-cli",
      }),
    ).toEqual({
      manager: "npm",
      executable: "npm",
      args: ["install", "-g", "wooo-cli@latest"],
      packageName: "wooo-cli",
      target: "latest",
      command: "npm install -g wooo-cli@latest",
    });
  });

  test("builds yarn global add commands", () => {
    expect(
      buildUpgradeCommandSpec({
        manager: "yarn",
        packageName: "wooo-cli",
        target: "0.2.0",
      }),
    ).toEqual({
      manager: "yarn",
      executable: "yarn",
      args: ["global", "add", "wooo-cli@0.2.0"],
      packageName: "wooo-cli",
      target: "0.2.0",
      command: "yarn global add wooo-cli@0.2.0",
    });
  });

  test("uses .cmd executables on Windows", () => {
    const spec = buildUpgradeCommandSpec({
      manager: "pnpm",
      packageName: "wooo-cli",
      platform: "win32",
    });

    expect(spec.executable).toBe("pnpm.cmd");
    expect(spec.command).toBe("pnpm.cmd add -g wooo-cli@latest");
  });

  test("rejects targets with whitespace", () => {
    expect(() =>
      buildUpgradeCommandSpec({
        manager: "npm",
        packageName: "wooo-cli",
        target: "latest beta",
      }),
    ).toThrow("must not contain whitespace");
  });
});

describe("checkForUpgrade", () => {
  test("returns latest version metadata and availability", async () => {
    const result = await checkForUpgrade({
      packageName: "wooo-cli",
      currentVersion: "0.1.0",
      fetchImpl: async () =>
        new Response(JSON.stringify({ version: "0.1.3" }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }),
    });

    expect(result).toEqual({
      packageName: "wooo-cli",
      currentVersion: "0.1.0",
      latestVersion: "0.1.3",
      updateAvailable: true,
    });
  });
});

describe("runUpgradeInstall", () => {
  test("returns the child process exit code", async () => {
    const exitCode = await runUpgradeInstall({
      manager: "npm",
      executable: process.execPath,
      args: ["-e", "process.exit(0)"],
      packageName: "wooo-cli",
      target: "latest",
      command: `${process.execPath} -e process.exit(0)`,
    });

    expect(exitCode).toBe(0);
  });

  test("surfaces missing executables clearly", async () => {
    await expect(
      runUpgradeInstall({
        manager: "npm",
        executable: "definitely-not-a-real-package-manager",
        args: ["install", "-g", "wooo-cli@latest"],
        packageName: "wooo-cli",
        target: "latest",
        command:
          "definitely-not-a-real-package-manager install -g wooo-cli@latest",
      }),
    ).rejects.toThrow("not installed or not available on PATH");
  });
});
