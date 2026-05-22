import { spawn } from "node:child_process";

export const SUPPORTED_UPGRADE_MANAGERS = [
  "npm",
  "pnpm",
  "yarn",
  "bun",
] as const;

export type UpgradeManager = (typeof SUPPORTED_UPGRADE_MANAGERS)[number];

export interface UpgradeCommandSpec {
  args: string[];
  command: string;
  executable: string;
  manager: UpgradeManager;
  packageName: string;
  target: string;
}

export interface UpgradeCheckResult {
  currentVersion: string;
  latestVersion: string;
  packageName: string;
  updateAvailable: boolean;
}

function asUpgradeManager(value: string): UpgradeManager | null {
  return SUPPORTED_UPGRADE_MANAGERS.includes(value as UpgradeManager)
    ? (value as UpgradeManager)
    : null;
}

function detectUpgradeManagerFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): UpgradeManager | null {
  const userAgent = env.npm_config_user_agent?.toLowerCase();
  if (userAgent) {
    for (const manager of SUPPORTED_UPGRADE_MANAGERS) {
      if (userAgent.startsWith(`${manager}/`)) {
        return manager;
      }
    }
  }

  const execPath = env.npm_execpath?.toLowerCase();
  if (execPath) {
    for (const manager of SUPPORTED_UPGRADE_MANAGERS) {
      if (execPath.includes(manager)) {
        return manager;
      }
    }
  }

  return null;
}

function validateTarget(target: string): string {
  const normalized = target.trim();
  if (!normalized) {
    throw new Error("Upgrade target must not be empty");
  }
  if (/\s/.test(normalized)) {
    throw new Error("Upgrade target must not contain whitespace");
  }
  return normalized;
}

export function resolveUpgradeManager(
  preferred?: string,
  env: NodeJS.ProcessEnv = process.env,
): UpgradeManager {
  if (preferred) {
    const manager = asUpgradeManager(preferred.trim().toLowerCase());
    if (manager) {
      return manager;
    }
    throw new Error(
      `Unsupported package manager: ${preferred}. Use one of ${SUPPORTED_UPGRADE_MANAGERS.join(
        ", ",
      )}.`,
    );
  }

  return detectUpgradeManagerFromEnv(env) ?? "npm";
}

function resolveManagerExecutable(
  manager: UpgradeManager,
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform !== "win32") {
    return manager;
  }
  if (manager === "bun") {
    return "bun.exe";
  }
  return `${manager}.cmd`;
}

export function buildUpgradeCommandSpec(options: {
  manager: UpgradeManager;
  packageName: string;
  platform?: NodeJS.Platform;
  target?: string;
}): UpgradeCommandSpec {
  const target = validateTarget(options.target ?? "latest");
  const packageRef = `${options.packageName}@${target}`;

  let args: string[];
  switch (options.manager) {
    case "npm":
      args = ["install", "-g", packageRef];
      break;
    case "pnpm":
      args = ["add", "-g", packageRef];
      break;
    case "yarn":
      args = ["global", "add", packageRef];
      break;
    case "bun":
      args = ["install", "-g", packageRef];
      break;
  }

  const executable = resolveManagerExecutable(
    options.manager,
    options.platform,
  );

  return {
    manager: options.manager,
    executable,
    args,
    packageName: options.packageName,
    target,
    command: [executable, ...args].join(" "),
  };
}

export async function fetchLatestPublishedVersion(
  packageName: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const response = await fetchImpl(
    `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`,
    {
      headers: {
        accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to fetch the latest published version for ${packageName} (HTTP ${response.status})`,
    );
  }

  const payload = (await response.json()) as { version?: unknown };
  if (typeof payload.version !== "string") {
    throw new Error(
      `Registry response for ${packageName} did not include a version`,
    );
  }

  return payload.version;
}

export async function checkForUpgrade(options: {
  currentVersion: string;
  packageName: string;
  fetchImpl?: typeof fetch;
}): Promise<UpgradeCheckResult> {
  const latestVersion = await fetchLatestPublishedVersion(
    options.packageName,
    options.fetchImpl,
  );

  return {
    packageName: options.packageName,
    currentVersion: options.currentVersion,
    latestVersion,
    updateAvailable: latestVersion !== options.currentVersion,
  };
}

export async function runUpgradeInstall(
  spec: UpgradeCommandSpec,
): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const child = spawn(spec.executable, spec.args, {
      stdio: "inherit",
    });

    child.once("error", (error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new Error(
            `${spec.manager} is not installed or not available on PATH. Run \`${spec.command}\` manually after installing ${spec.manager}.`,
          ),
        );
        return;
      }
      reject(error);
    });

    child.once("close", (code) => {
      resolve(code ?? 1);
    });
  });
}
