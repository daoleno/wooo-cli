import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface PackageMeta {
  name: string;
  version: string;
  description: string;
  packageJsonPath: string | null;
}

const FALLBACK_PACKAGE_META: PackageMeta = {
  name: "wooo-cli",
  version: "0.0.0",
  description:
    "Terminal-native copilot for trading, DeFi, and on-chain execution.",
  packageJsonPath: null,
};

let cachedPackageMeta: PackageMeta | null = null;

function parsePackageMeta(candidatePath: string): PackageMeta | null {
  const parsed = JSON.parse(readFileSync(candidatePath, "utf-8")) as {
    description?: unknown;
    name?: unknown;
    version?: unknown;
  };

  if (typeof parsed.name !== "string" || typeof parsed.version !== "string") {
    return null;
  }

  return {
    name: parsed.name,
    version: parsed.version,
    description:
      typeof parsed.description === "string"
        ? parsed.description
        : FALLBACK_PACKAGE_META.description,
    packageJsonPath: candidatePath,
  };
}

export function loadPackageMeta(): PackageMeta {
  if (cachedPackageMeta) {
    return cachedPackageMeta;
  }

  let dir = dirname(fileURLToPath(import.meta.url));

  while (true) {
    const candidatePath = join(dir, "package.json");

    if (existsSync(candidatePath)) {
      const meta = parsePackageMeta(candidatePath);
      if (meta) {
        cachedPackageMeta = meta;
        return meta;
      }
    }

    const parentDir = dirname(dir);
    if (parentDir === dir) {
      break;
    }
    dir = parentDir;
  }

  cachedPackageMeta = FALLBACK_PACKAGE_META;
  return cachedPackageMeta;
}
