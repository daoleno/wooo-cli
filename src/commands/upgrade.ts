import { defineCommand } from "citty";
import { loadPackageMeta } from "../core/package-meta";
import {
  buildUpgradeCommandSpec,
  checkForUpgrade,
  resolveUpgradeManager,
  runUpgradeInstall,
} from "../core/upgrade";

export default defineCommand({
  meta: {
    name: "upgrade",
    description: "Upgrade wooo-cli to the latest published version",
  },
  args: {
    manager: {
      type: "string",
      description: "Package manager to use: npm, pnpm, yarn, bun",
    },
    target: {
      type: "string",
      description: "Target version or dist-tag (default: latest)",
      default: "latest",
    },
    check: {
      type: "boolean",
      description: "Check whether a newer published version exists",
      default: false,
    },
    "dry-run": {
      type: "boolean",
      description: "Show the upgrade command without executing it",
      default: false,
    },
    json: {
      type: "boolean",
      description: "Force JSON output",
      default: false,
    },
    format: {
      type: "string",
      description: "Output format",
      default: "table",
    },
  },
  async run({ args }) {
    const packageMeta = loadPackageMeta();
    const manager = resolveUpgradeManager(args.manager);
    const spec = buildUpgradeCommandSpec({
      manager,
      packageName: packageMeta.name,
      target: args.target,
    });

    const shouldCheck =
      args.check || args["dry-run"] || args.target === "latest";
    const write = (message: string) => {
      process.stdout.write(`${message}\n`);
    };

    let upgradeCheck: Awaited<ReturnType<typeof checkForUpgrade>> | null = null;

    if (shouldCheck) {
      try {
        upgradeCheck = await checkForUpgrade({
          packageName: packageMeta.name,
          currentVersion: packageMeta.version,
        });
      } catch (error) {
        if (args.check) {
          throw error;
        }

        const reason =
          error instanceof Error ? error.message : "unknown registry error";
        process.stderr.write(
          `Unable to verify the latest published version, continuing with ${spec.target}: ${reason}\n`,
        );
      }
    }

    if (args.check || args["dry-run"]) {
      const result = {
        package: packageMeta.name,
        currentVersion: packageMeta.version,
        latestVersion: upgradeCheck?.latestVersion ?? null,
        target: spec.target,
        manager: spec.manager,
        command: spec.command,
        updateAvailable: upgradeCheck?.updateAvailable ?? null,
        willExecute: false,
      };

      write(
        args.json ? JSON.stringify(result) : JSON.stringify(result, null, 2),
      );
      return;
    }

    if (args.json) {
      throw new Error(
        "`upgrade` does not support --json while executing an install. Use --check --json or --dry-run --json instead.",
      );
    }

    if (
      upgradeCheck &&
      !upgradeCheck.updateAvailable &&
      spec.target === "latest"
    ) {
      write(
        `${packageMeta.name} is already up to date at ${packageMeta.version}`,
      );
      return;
    }

    const targetVersion = upgradeCheck?.latestVersion ?? spec.target;
    process.stderr.write(
      `Upgrading ${packageMeta.name} from ${packageMeta.version} to ${targetVersion} using ${spec.manager}\n`,
    );
    process.stderr.write(`Running: ${spec.command}\n`);

    const exitCode = await runUpgradeInstall(spec);
    if (exitCode !== 0) {
      throw new Error(`Upgrade command failed with exit code ${exitCode}`);
    }

    write(`Upgraded ${packageMeta.name} to ${targetVersion}`);
  },
});
