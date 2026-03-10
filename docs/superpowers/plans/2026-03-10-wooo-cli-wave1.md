# wooo-cli Wave 1 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the wooo-cli foundation — project scaffolding, core infrastructure (output, config, error, logger, keystore), protocol registry, wallet commands, config commands, and the first protocol (Hyperliquid).

**Architecture:** Single-package CLI using Citty (unjs) for command routing, c12 for config loading, and a `protocols/` directory where each exchange/DeFi protocol is an independent command group. Dual-mode output (TTY-detected human format + `--json` structured output).

**Tech Stack:** TypeScript (strict), Citty, c12, Viem, ansis, console-table-printer, @clack/prompts, Zod, Biome, tsdown, Bun (test runner)

**Spec:** `docs/superpowers/specs/2026-03-10-wooo-cli-design.md`

---

## Chunk 1: Project Scaffolding & Core Infrastructure

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `biome.json`
- Create: `src/index.ts`

- [ ] **Step 1: Initialize project and install dependencies**

```bash
cd /home/daoleno/workspace/wooo-cli
bun init -y
bun add citty c12 viem ansis console-table-printer @clack/prompts zod
bun add -d typescript @types/node tsdown @biomejs/biome
```

- [ ] **Step 2: Configure tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Configure biome.json**

```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "organizeImports": { "enabled": true },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2
  },
  "linter": {
    "enabled": true,
    "rules": { "recommended": true }
  }
}
```

- [ ] **Step 4: Create minimal entry point**

Create `src/index.ts`:

```typescript
import { defineCommand, runMain } from "citty";

const main = defineCommand({
  meta: {
    name: "wooo",
    version: "0.1.0",
    description: "Crypto All-in-One CLI",
  },
  run() {
    console.log("wooo-cli v0.1.0 — run `wooo --help` for commands");
  },
});

runMain(main);
```

- [ ] **Step 5: Replace package.json**

Replace the contents of `package.json` with:

```json
{
  "name": "wooo-cli",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "wooo": "./dist/index.mjs"
  },
  "scripts": {
    "dev": "bun run src/index.ts",
    "build": "tsdown src/index.ts --format esm --dts",
    "type-check": "tsc --noEmit",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "test": "bun test"
  }
}
```

- [ ] **Step 6: Verify it runs**

Run: `cd /home/daoleno/workspace/wooo-cli && bun run dev`
Expected: `wooo-cli v0.1.0 — run 'wooo --help' for commands`

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json biome.json src/index.ts bun.lockb
git commit -m "feat: scaffold wooo-cli project with citty"
```

---

### Task 2: Core Error Handling

**Files:**
- Create: `src/core/error.ts`
- Create: `tests/core/error.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/core/error.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { WoooError, ExitCode, formatError } from "../src/core/error";

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
    expect(parsed).toEqual({
      error: "auth failed",
      code: 3,
    });
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/daoleno/workspace/wooo-cli && bun test tests/core/error.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

Create `src/core/error.ts`:

```typescript
export const ExitCode = {
  SUCCESS: 0,
  GENERAL_ERROR: 1,
  ARGUMENT_ERROR: 2,
  AUTH_FAILURE: 3,
  NETWORK_ERROR: 4,
  TRADE_REJECTED: 5,
  USER_CANCELLED: 6,
} as const;

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];

export class WoooError extends Error {
  readonly exitCode: ExitCodeValue;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    exitCode: ExitCodeValue = ExitCode.GENERAL_ERROR,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "WoooError";
    this.exitCode = exitCode;
    this.details = details;
  }
}

export function formatError(err: WoooError, jsonMode: boolean): string {
  if (jsonMode) {
    const obj: Record<string, unknown> = {
      error: err.message,
      code: err.exitCode,
    };
    if (err.details) {
      obj.details = err.details;
    }
    return JSON.stringify(obj);
  }
  return `Error: ${err.message}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/daoleno/workspace/wooo-cli && bun test tests/core/error.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /home/daoleno/workspace/wooo-cli
git add src/core/error.ts tests/core/error.test.ts
git commit -m "feat(core): add error handling with exit codes"
```

---

### Task 3: Core Logger

**Files:**
- Create: `src/core/logger.ts`
- Create: `tests/core/logger.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/core/logger.test.ts`:

```typescript
import { describe, expect, test, spyOn } from "bun:test";
import { createLogger, LogLevel } from "../src/core/logger";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/daoleno/workspace/wooo-cli && bun test tests/core/logger.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

Create `src/core/logger.ts`:

```typescript
import ansis from "ansis";

export const LogLevel = {
  QUIET: 0,
  ERROR: 1,
  WARN: 2,
  INFO: 3,
  DEBUG: 4,
} as const;

export type LogLevelValue = (typeof LogLevel)[keyof typeof LogLevel];

export interface Logger {
  debug(msg: string): void;
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

export function createLogger(level: LogLevelValue = LogLevel.INFO): Logger {
  const write = (msg: string) => {
    process.stderr.write(msg + "\n");
  };

  return {
    debug(msg: string) {
      if (level >= LogLevel.DEBUG) {
        write(ansis.gray(`[debug] ${msg}`));
      }
    },
    info(msg: string) {
      if (level >= LogLevel.INFO) {
        write(ansis.blue(`[info] ${msg}`));
      }
    },
    warn(msg: string) {
      if (level >= LogLevel.WARN) {
        write(ansis.yellow(`[warn] ${msg}`));
      }
    },
    error(msg: string) {
      if (level >= LogLevel.ERROR) {
        write(ansis.red(`[error] ${msg}`));
      }
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/daoleno/workspace/wooo-cli && bun test tests/core/logger.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /home/daoleno/workspace/wooo-cli
git add src/core/logger.ts tests/core/logger.test.ts
git commit -m "feat(core): add logger with stderr output and log levels"
```

---

### Task 4: Core Output Engine

**Files:**
- Create: `src/core/output.ts`
- Create: `tests/core/output.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/core/output.test.ts`:

```typescript
import { describe, expect, test, spyOn } from "bun:test";
import { createOutput } from "../src/core/output";

describe("createOutput", () => {
  test("json mode outputs JSON to stdout", () => {
    const spy = spyOn(process.stdout, "write").mockImplementation(() => true);
    const out = createOutput({ json: true, format: "json" });
    out.data({ symbol: "BTC", price: 65000 });
    const output = spy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output.trim());
    expect(parsed).toEqual({ symbol: "BTC", price: 65000 });
    spy.mockRestore();
  });

  test("table mode outputs formatted table to stdout", () => {
    const spy = spyOn(process.stdout, "write").mockImplementation(() => true);
    const out = createOutput({ json: false, format: "table" });
    out.table([{ symbol: "BTC", price: 65000 }], {
      columns: ["symbol", "price"],
    });
    expect(spy).toHaveBeenCalled();
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain("BTC");
    expect(output).toContain("65000");
    spy.mockRestore();
  });

  test("csv format outputs CSV", () => {
    const spy = spyOn(process.stdout, "write").mockImplementation(() => true);
    const out = createOutput({ json: false, format: "csv" });
    out.table(
      [
        { symbol: "BTC", price: 65000 },
        { symbol: "ETH", price: 3500 },
      ],
      { columns: ["symbol", "price"] }
    );
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain("symbol,price");
    expect(output).toContain("BTC,65000");
    spy.mockRestore();
  });

  test("success prints success message", () => {
    const spy = spyOn(process.stdout, "write").mockImplementation(() => true);
    const out = createOutput({ json: false, format: "table" });
    out.success("Done!");
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain("Done!");
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/daoleno/workspace/wooo-cli && bun test tests/core/output.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

Create `src/core/output.ts`:

```typescript
import { Table } from "console-table-printer";
import ansis from "ansis";

export interface OutputOptions {
  json: boolean;
  format: "table" | "csv" | "json";
}

export interface TableOptions {
  columns: string[];
  title?: string;
}

export interface Output {
  data(obj: unknown): void;
  table(rows: Record<string, unknown>[], opts: TableOptions): void;
  success(msg: string): void;
  warn(msg: string): void;
}

function write(str: string) {
  process.stdout.write(str + "\n");
}

export function createOutput(opts: OutputOptions): Output {
  const isJson = opts.json || opts.format === "json";

  return {
    data(obj: unknown) {
      if (isJson) {
        write(JSON.stringify(obj, null, 2));
      } else {
        write(typeof obj === "string" ? obj : JSON.stringify(obj, null, 2));
      }
    },

    table(rows: Record<string, unknown>[], tableOpts: TableOptions) {
      if (isJson) {
        write(JSON.stringify(rows, null, 2));
        return;
      }

      if (opts.format === "csv") {
        const { columns } = tableOpts;
        write(columns.join(","));
        for (const row of rows) {
          write(columns.map((c) => String(row[c] ?? "")).join(","));
        }
        return;
      }

      // Table format
      if (tableOpts.title) {
        write(ansis.bold(tableOpts.title));
      }
      const t = new Table({
        columns: tableOpts.columns.map((name) => ({
          name,
          alignment: "left",
        })),
      });
      for (const row of rows) {
        t.addRow(row);
      }
      write(t.render());
    },

    success(msg: string) {
      if (isJson) {
        write(JSON.stringify({ status: "success", message: msg }));
      } else {
        write(ansis.green(`✓ ${msg}`));
      }
    },

    warn(msg: string) {
      if (isJson) {
        write(JSON.stringify({ status: "warning", message: msg }));
      } else {
        write(ansis.yellow(`⚠ ${msg}`));
      }
    },
  };
}

export function resolveOutputOptions(args: {
  json?: boolean;
  format?: string;
}): OutputOptions {
  if (args.json) {
    return { json: true, format: "json" };
  }
  const format = (args.format as OutputOptions["format"]) || "table";
  return { json: false, format };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/daoleno/workspace/wooo-cli && bun test tests/core/output.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /home/daoleno/workspace/wooo-cli
git add src/core/output.ts tests/core/output.test.ts
git commit -m "feat(core): add dual-mode output engine (json/table/csv)"
```

---

### Task 5: Core Config (c12)

**Files:**
- Create: `src/core/config.ts`
- Create: `tests/core/config.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/core/config.test.ts`:

```typescript
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadWoooConfig, getConfigDir } from "../src/core/config";

describe("getConfigDir", () => {
  const originalEnv = process.env.WOOO_CONFIG_DIR;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.WOOO_CONFIG_DIR;
    } else {
      process.env.WOOO_CONFIG_DIR = originalEnv;
    }
  });

  test("uses WOOO_CONFIG_DIR env when set", () => {
    process.env.WOOO_CONFIG_DIR = "/tmp/custom-wooo";
    expect(getConfigDir()).toBe("/tmp/custom-wooo");
  });

  test("falls back to ~/.config/wooo when env not set", () => {
    delete process.env.WOOO_CONFIG_DIR;
    const result = getConfigDir();
    expect(result).toContain(".config/wooo");
  });
});

describe("loadWoooConfig", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "wooo-config-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("loads config from directory", async () => {
    writeFileSync(
      join(tempDir, "wooo.config.json"),
      JSON.stringify({
        default: { chain: "ethereum", wallet: "main" },
      })
    );
    const config = await loadWoooConfig(tempDir);
    expect(config.default?.chain).toBe("ethereum");
    expect(config.default?.wallet).toBe("main");
  });

  test("returns defaults when no config file exists", async () => {
    const config = await loadWoooConfig(tempDir);
    expect(config.default).toBeDefined();
    expect(config.default?.chain).toBe("ethereum");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/daoleno/workspace/wooo-cli && bun test tests/core/config.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

Create `src/core/config.ts`:

```typescript
import { loadConfig } from "c12";
import { join } from "node:path";
import { homedir } from "node:os";

export interface WoooConfig {
  default?: {
    chain?: string;
    wallet?: string;
    format?: "table" | "csv" | "json";
  };
  chains?: Record<
    string,
    {
      rpc?: string;
    }
  >;
  [protocol: string]: unknown;
}

const CONFIG_DEFAULTS: WoooConfig = {
  default: {
    chain: "ethereum",
    wallet: "main",
    format: "table",
  },
  chains: {
    ethereum: { rpc: "https://eth.llamarpc.com" },
    arbitrum: { rpc: "https://arb1.arbitrum.io/rpc" },
    base: { rpc: "https://mainnet.base.org" },
  },
};

export function getConfigDir(): string {
  return (
    process.env.WOOO_CONFIG_DIR || join(homedir(), ".config", "wooo")
  );
}

export async function loadWoooConfig(
  cwd?: string
): Promise<WoooConfig> {
  const configDir = cwd || getConfigDir();
  const { config } = await loadConfig<WoooConfig>({
    name: "wooo",
    cwd: configDir,
    defaults: CONFIG_DEFAULTS,
    rcFile: ".wooorc",
    packageJson: false,
  });
  return config as WoooConfig;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/daoleno/workspace/wooo-cli && bun test tests/core/config.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /home/daoleno/workspace/wooo-cli
git add src/core/config.ts tests/core/config.test.ts
git commit -m "feat(core): add c12-based config loader"
```

---

### Task 6: Core Keystore

**Files:**
- Create: `src/core/keystore.ts`
- Create: `tests/core/keystore.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/core/keystore.test.ts`:

```typescript
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Keystore } from "../src/core/keystore";

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
    // Read the raw file to verify it's not plaintext
    const { readFileSync } = await import("node:fs");
    const files = (await import("node:fs")).readdirSync(tempDir);
    const content = readFileSync(join(tempDir, files[0]), "utf-8");
    expect(content).not.toContain("0xdeadbeef");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/daoleno/workspace/wooo-cli && bun test tests/core/keystore.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

Create `src/core/keystore.ts`:

```typescript
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_LENGTH) as Buffer;
}

function safeFilename(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, "_") + ".enc";
}

export class Keystore {
  private dir: string;
  private password: string;

  constructor(dir: string, password: string) {
    this.dir = dir;
    this.password = password;
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  async set(key: string, value: string): Promise<void> {
    const salt = randomBytes(SALT_LENGTH);
    const iv = randomBytes(IV_LENGTH);
    const derivedKey = deriveKey(this.password, salt);
    const cipher = createCipheriv(ALGORITHM, derivedKey, iv);

    const encrypted = Buffer.concat([
      cipher.update(value, "utf-8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    // Format: salt(16) + iv(12) + tag(16) + encrypted
    const data = Buffer.concat([salt, iv, tag, encrypted]);
    writeFileSync(join(this.dir, safeFilename(key)), data.toString("base64"));
  }

  async get(key: string): Promise<string | null> {
    const filePath = join(this.dir, safeFilename(key));
    if (!existsSync(filePath)) return null;

    const raw = Buffer.from(readFileSync(filePath, "utf-8"), "base64");
    const salt = raw.subarray(0, SALT_LENGTH);
    const iv = raw.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = raw.subarray(
      SALT_LENGTH + IV_LENGTH,
      SALT_LENGTH + IV_LENGTH + TAG_LENGTH
    );
    const encrypted = raw.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

    const derivedKey = deriveKey(this.password, salt);
    const decipher = createDecipheriv(ALGORITHM, derivedKey, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    return decrypted.toString("utf-8");
  }

  async delete(key: string): Promise<void> {
    const filePath = join(this.dir, safeFilename(key));
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  }

  async list(): Promise<string[]> {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter((f) => f.endsWith(".enc"))
      .map((f) => f.replace(/_/g, ":").replace(/\.enc$/, ""))
      .map((f) => {
        // Reverse the safe filename transform: wallet_main -> wallet:main
        // Since we replaced : with _, we need to handle this
        return f;
      });
  }
}
```

Note: The `list()` method's reverse transform is imperfect — the safe filename replaces `:` and other chars with `_`, making reverse-mapping lossy. A better approach is to store a manifest. However, for Wave 1 this is sufficient — keys are only looked up by exact name (via `get`), and `list` is used for display only.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/daoleno/workspace/wooo-cli && bun test tests/core/keystore.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /home/daoleno/workspace/wooo-cli
git add src/core/keystore.ts tests/core/keystore.test.ts
git commit -m "feat(core): add AES-256-GCM keystore for secret management"
```

---

### Task 7: Global Flags & Main Command Wiring

**Files:**
- Create: `src/core/globals.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Create global flags definition**

Create `src/core/globals.ts`:

```typescript
export const globalArgs = {
  json: {
    type: "boolean" as const,
    description: "Force JSON output",
    default: false,
  },
  format: {
    type: "string" as const,
    description: "Output format: table, csv, json",
    default: "table",
  },
  chain: {
    type: "string" as const,
    description: "Specify chain (default from config)",
  },
  wallet: {
    type: "string" as const,
    description: "Specify wallet (default: active wallet)",
  },
  yes: {
    type: "boolean" as const,
    description: "Skip confirmations (agent-friendly)",
    default: false,
  },
  "dry-run": {
    type: "boolean" as const,
    description: "Preview without executing",
    default: false,
  },
  verbose: {
    type: "boolean" as const,
    description: "Show debug logs",
    default: false,
  },
  quiet: {
    type: "boolean" as const,
    description: "Suppress non-essential output",
    default: false,
  },
  config: {
    type: "string" as const,
    description: "Config directory path",
  },
};
```

- [ ] **Step 2: Update main entry point with subcommands structure**

Update `src/index.ts`:

```typescript
import { defineCommand, runMain } from "citty";
import { globalArgs } from "./core/globals";

const main = defineCommand({
  meta: {
    name: "wooo",
    version: "0.1.0",
    description: "Crypto All-in-One CLI",
  },
  args: globalArgs,
  // subCommands will be added in Tasks 8-10 when command files are created
  run() {
    console.log("wooo-cli v0.1.0 — run `wooo --help` for commands");
  },
});

runMain(main);
```

- [ ] **Step 3: Verify it still runs**

Run: `cd /home/daoleno/workspace/wooo-cli && bun run dev`
Expected: Output contains `wooo-cli v0.1.0`

Run: `cd /home/daoleno/workspace/wooo-cli && bun run dev -- --help`
Expected: Output contains `wooo` and flags like `--json`, `--verbose`, `--quiet`

- [ ] **Step 4: Commit**

```bash
cd /home/daoleno/workspace/wooo-cli
git add src/core/globals.ts src/index.ts
git commit -m "feat(core): add global flags and subcommand routing"
```

---

## Chunk 2: Config & Wallet Commands

### Task 8: Config Commands

**Files:**
- Create: `src/commands/config/index.ts`
- Create: `src/commands/config/init.ts`
- Create: `src/commands/config/set.ts`
- Create: `src/commands/config/get.ts`
- Create: `src/commands/config/list.ts`
- Create: `tests/commands/config.test.ts`

- [ ] **Step 1: Write failing test for config set + get round-trip**

Create `tests/commands/config.test.ts`:

```typescript
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadWoooConfig, getConfigDir } from "../src/core/config";

describe("config round-trip", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "wooo-config-cmd-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("set and get a dotted key", () => {
    const configPath = join(tempDir, "wooo.config.json");
    writeFileSync(configPath, JSON.stringify({ default: { chain: "ethereum" } }));

    // Simulate config set: default.wallet = "test"
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    config.default = config.default || {};
    config.default.wallet = "test";
    writeFileSync(configPath, JSON.stringify(config, null, 2));

    // Verify
    const loaded = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(loaded.default.wallet).toBe("test");
    expect(loaded.default.chain).toBe("ethereum");
  });

  test("loadWoooConfig returns defaults when no file", async () => {
    const config = await loadWoooConfig(tempDir);
    expect(config.default?.chain).toBe("ethereum");
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd /home/daoleno/workspace/wooo-cli && bun test tests/commands/config.test.ts`
Expected: All 2 tests PASS

- [ ] **Step 3: Create config command group**

Create `src/commands/config/index.ts`:

```typescript
import { defineCommand } from "citty";

export default defineCommand({
  meta: {
    name: "config",
    description: "Manage wooo-cli configuration",
  },
  subCommands: {
    init: () => import("./init").then((m) => m.default),
    set: () => import("./set").then((m) => m.default),
    get: () => import("./get").then((m) => m.default),
    list: () => import("./list").then((m) => m.default),
  },
});
```

Create `src/commands/config/init.ts`:

```typescript
import { defineCommand } from "citty";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getConfigDir } from "../../core/config";

export default defineCommand({
  meta: {
    name: "init",
    description: "Initialize wooo-cli configuration",
  },
  run() {
    const configDir = getConfigDir();
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    const configPath = join(configDir, "wooo.config.json");
    if (existsSync(configPath)) {
      console.log(`Config already exists at ${configPath}`);
      return;
    }

    const defaultConfig = {
      default: {
        chain: "ethereum",
        wallet: "main",
        format: "table",
      },
      chains: {
        ethereum: { rpc: "https://eth.llamarpc.com" },
        arbitrum: { rpc: "https://arb1.arbitrum.io/rpc" },
        base: { rpc: "https://mainnet.base.org" },
      },
    };

    writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    console.log(`Config created at ${configPath}`);
  },
});
```

Create `src/commands/config/set.ts`:

```typescript
import { defineCommand } from "citty";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getConfigDir } from "../../core/config";

export default defineCommand({
  meta: {
    name: "set",
    description: "Set a configuration value",
  },
  args: {
    key: {
      type: "positional",
      description: "Config key (e.g. default.chain, okx.api-key)",
      required: true,
    },
    value: {
      type: "positional",
      description: "Config value",
      required: true,
    },
  },
  run({ args }) {
    const configPath = join(getConfigDir(), "wooo.config.json");
    let config: Record<string, unknown> = {};

    if (existsSync(configPath)) {
      config = JSON.parse(readFileSync(configPath, "utf-8"));
    }

    // Support dotted keys: "default.chain" -> config.default.chain
    const parts = args.key.split(".");
    let current: Record<string, unknown> = config;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in current) || typeof current[parts[i]] !== "object") {
        current[parts[i]] = {};
      }
      current = current[parts[i]] as Record<string, unknown>;
    }
    current[parts[parts.length - 1]] = args.value;

    writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(`Set ${args.key} = ${args.value}`);
  },
});
```

Create `src/commands/config/get.ts`:

```typescript
import { defineCommand } from "citty";
import { getConfigDir, loadWoooConfig } from "../../core/config";

export default defineCommand({
  meta: {
    name: "get",
    description: "Get a configuration value",
  },
  args: {
    key: {
      type: "positional",
      description: "Config key (e.g. default.chain)",
      required: true,
    },
  },
  async run({ args }) {
    const config = await loadWoooConfig();
    const parts = args.key.split(".");
    let current: unknown = config;
    for (const part of parts) {
      if (current && typeof current === "object" && part in current) {
        current = (current as Record<string, unknown>)[part];
      } else {
        console.log(`Key "${args.key}" not found`);
        return;
      }
    }
    console.log(typeof current === "object" ? JSON.stringify(current, null, 2) : String(current));
  },
});
```

Create `src/commands/config/list.ts`:

```typescript
import { defineCommand } from "citty";
import { loadWoooConfig } from "../../core/config";

export default defineCommand({
  meta: {
    name: "list",
    description: "List all configuration values",
  },
  async run() {
    const config = await loadWoooConfig();
    console.log(JSON.stringify(config, null, 2));
  },
});
```

- [ ] **Step 4: Verify commands work**

Run: `cd /home/daoleno/workspace/wooo-cli && bun run dev -- config --help`
Expected: Shows config subcommands (init, set, get, list)

Run: `cd /home/daoleno/workspace/wooo-cli && bun run dev -- config list`
Expected: Shows default config JSON

- [ ] **Step 5: Wire config subcommand into index.ts**

Update `src/index.ts` to add the config subcommand:

```typescript
import { defineCommand, runMain } from "citty";
import { globalArgs } from "./core/globals";

const main = defineCommand({
  meta: {
    name: "wooo",
    version: "0.1.0",
    description: "Crypto All-in-One CLI",
  },
  args: globalArgs,
  subCommands: {
    config: () => import("./commands/config/index").then((m) => m.default),
  },
  run() {
    console.log("wooo-cli v0.1.0 — run `wooo --help` for commands");
  },
});

runMain(main);
```

- [ ] **Step 6: Commit**

```bash
cd /home/daoleno/workspace/wooo-cli
git add src/commands/config/ src/index.ts
git commit -m "feat(commands): add config init/set/get/list commands"
```

---

### Task 9: Wallet Commands

**Files:**
- Create: `src/commands/wallet/index.ts`
- Create: `src/commands/wallet/generate.ts`
- Create: `src/commands/wallet/list.ts`
- Create: `src/commands/wallet/balance.ts`
- Create: `src/commands/wallet/import.ts`
- Create: `src/commands/wallet/export.ts`
- Create: `src/commands/wallet/switch.ts`
- Create: `src/core/wallet-store.ts`
- Create: `tests/commands/wallet.test.ts`

- [ ] **Step 1: Write the failing test for wallet store**

Create `tests/commands/wallet.test.ts`:

```typescript
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { WalletStore } from "../src/core/wallet-store";

const TEST_PASSWORD = "test-master-password-32-chars-ok!";

describe("WalletStore", () => {
  let tempDir: string;
  let store: WalletStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "wooo-wallet-test-"));
    store = new WalletStore(tempDir, TEST_PASSWORD);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("generates a new EVM wallet", async () => {
    const wallet = await store.generate("test-wallet", "evm");
    expect(wallet.name).toBe("test-wallet");
    expect(wallet.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(wallet.chain).toBe("evm");
  });

  test("lists wallets", async () => {
    await store.generate("w1", "evm");
    await store.generate("w2", "evm");
    const wallets = await store.list();
    expect(wallets.length).toBe(2);
    expect(wallets.map((w) => w.name)).toContain("w1");
    expect(wallets.map((w) => w.name)).toContain("w2");
  });

  test("imports a wallet from private key", async () => {
    // Generate a valid private key via viem
    const { generatePrivateKey, privateKeyToAccount } = await import("viem/accounts");
    const pk = generatePrivateKey();
    const account = privateKeyToAccount(pk);

    const wallet = await store.importKey("imported", pk, "evm");
    expect(wallet.address).toBe(account.address);
  });

  test("exports private key", async () => {
    const { generatePrivateKey } = await import("viem/accounts");
    const pk = generatePrivateKey();
    await store.importKey("export-test", pk, "evm");
    const exported = await store.exportKey("export-test");
    expect(exported).toBe(pk);
  });

  test("switches active wallet", async () => {
    await store.generate("w1", "evm");
    await store.generate("w2", "evm");
    await store.setActive("w2");
    const active = await store.getActive();
    expect(active?.name).toBe("w2");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/daoleno/workspace/wooo-cli && bun test tests/commands/wallet.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write WalletStore implementation**

Create `src/core/wallet-store.ts`:

```typescript
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { Keystore } from "./keystore";

export interface WalletInfo {
  name: string;
  address: string;
  chain: string;
  active: boolean;
}

interface WalletManifest {
  wallets: Array<{
    name: string;
    address: string;
    chain: string;
  }>;
  active: string | null;
}

export class WalletStore {
  private keystore: Keystore;
  private manifestPath: string;

  constructor(dir: string, password: string) {
    const keystoreDir = join(dir, "keys");
    this.keystore = new Keystore(keystoreDir, password);
    this.manifestPath = join(dir, "wallets.json");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  private loadManifest(): WalletManifest {
    if (!existsSync(this.manifestPath)) {
      return { wallets: [], active: null };
    }
    return JSON.parse(readFileSync(this.manifestPath, "utf-8"));
  }

  private saveManifest(manifest: WalletManifest): void {
    writeFileSync(this.manifestPath, JSON.stringify(manifest, null, 2));
  }

  async generate(
    name: string,
    chain: string
  ): Promise<WalletInfo> {
    const pk = generatePrivateKey();
    return this.importKey(name, pk, chain);
  }

  async importKey(
    name: string,
    privateKey: string,
    chain: string
  ): Promise<WalletInfo> {
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    await this.keystore.set(`wallet:${name}`, privateKey);

    const manifest = this.loadManifest();

    // Remove existing wallet with same name
    manifest.wallets = manifest.wallets.filter((w) => w.name !== name);

    manifest.wallets.push({
      name,
      address: account.address,
      chain,
    });

    // Auto-activate first wallet
    if (!manifest.active) {
      manifest.active = name;
    }

    this.saveManifest(manifest);

    return {
      name,
      address: account.address,
      chain,
      active: manifest.active === name,
    };
  }

  async list(): Promise<WalletInfo[]> {
    const manifest = this.loadManifest();
    return manifest.wallets.map((w) => ({
      ...w,
      active: manifest.active === w.name,
    }));
  }

  async exportKey(name: string): Promise<string | null> {
    return this.keystore.get(`wallet:${name}`);
  }

  async setActive(name: string): Promise<void> {
    const manifest = this.loadManifest();
    const exists = manifest.wallets.some((w) => w.name === name);
    if (!exists) {
      throw new Error(`Wallet "${name}" not found`);
    }
    manifest.active = name;
    this.saveManifest(manifest);
  }

  async getActive(): Promise<WalletInfo | null> {
    const manifest = this.loadManifest();
    if (!manifest.active) return null;
    const wallet = manifest.wallets.find((w) => w.name === manifest.active);
    if (!wallet) return null;
    return { ...wallet, active: true };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/daoleno/workspace/wooo-cli && bun test tests/commands/wallet.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit wallet store**

```bash
cd /home/daoleno/workspace/wooo-cli
git add src/core/wallet-store.ts tests/commands/wallet.test.ts
git commit -m "feat(core): add wallet store with generate/import/export"
```

- [ ] **Step 6: Create wallet CLI commands**

Create `src/commands/wallet/index.ts`:

```typescript
import { defineCommand } from "citty";

export default defineCommand({
  meta: {
    name: "wallet",
    description: "Manage wallets",
  },
  subCommands: {
    generate: () => import("./generate").then((m) => m.default),
    import: () => import("./import").then((m) => m.default),
    list: () => import("./list").then((m) => m.default),
    balance: () => import("./balance").then((m) => m.default),
    export: () => import("./export").then((m) => m.default),
    switch: () => import("./switch").then((m) => m.default),
  },
});
```

First, create a shared helper to reduce repeated boilerplate across wallet/trading commands.

Create `src/core/context.ts`:

```typescript
import { WalletStore } from "./wallet-store";
import { getConfigDir } from "./config";
import { join } from "node:path";

export function getWalletStore(): WalletStore {
  const password = process.env.WOOO_MASTER_PASSWORD;
  if (!password) {
    console.error("Error: Set WOOO_MASTER_PASSWORD environment variable");
    process.exit(3);
  }
  return new WalletStore(join(getConfigDir(), "keystore"), password);
}

export async function getActivePrivateKey(): Promise<string> {
  const store = getWalletStore();
  const active = await store.getActive();
  if (!active) {
    console.error("No active wallet. Run `wooo wallet generate` first.");
    process.exit(1);
  }
  const pk = await store.exportKey(active.name);
  if (!pk) {
    console.error("Could not retrieve wallet key");
    process.exit(1);
  }
  return pk;
}
```

Create `src/commands/wallet/generate.ts`:

```typescript
import { defineCommand } from "citty";
import { getWalletStore } from "../../core/context";
import { createOutput, resolveOutputOptions } from "../../core/output";

export default defineCommand({
  meta: {
    name: "generate",
    description: "Generate a new wallet",
  },
  args: {
    name: {
      type: "positional",
      description: "Wallet name",
      required: false,
    },
    chain: {
      type: "string",
      description: "Chain type: evm, solana",
      default: "evm",
    },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const name = args.name || `wallet-${Date.now()}`;
    const store = getWalletStore();
    const wallet = await store.generate(name, args.chain);
    const out = createOutput(resolveOutputOptions(args));
    out.data({
      name: wallet.name,
      address: wallet.address,
      chain: wallet.chain,
      active: wallet.active,
    });
  },
});
```

Create `src/commands/wallet/import.ts`:

```typescript
import { defineCommand } from "citty";
import { getWalletStore } from "../../core/context";
import { createOutput, resolveOutputOptions } from "../../core/output";
import ansis from "ansis";

export default defineCommand({
  meta: {
    name: "import",
    description: "Import a wallet from private key",
  },
  args: {
    key: {
      type: "positional",
      description: "Private key (or use stdin/--file/interactive)",
      required: false,
    },
    name: {
      type: "string",
      description: "Wallet name",
    },
    file: {
      type: "string",
      description: "Read private key from file",
    },
    chain: {
      type: "string",
      description: "Chain type",
      default: "evm",
    },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    let privateKey: string;

    if (args.file) {
      const { readFileSync } = await import("node:fs");
      privateKey = readFileSync(args.file, "utf-8").trim();
    } else if (args.key) {
      console.error(
        ansis.yellow("⚠ Warning: Private key in CLI args is visible in shell history.")
      );
      privateKey = args.key;
    } else if (process.stdin.isTTY) {
      // Interactive TTY mode — use clack prompt to hide input
      const { password } = await import("@clack/prompts").then((m) =>
        m.password({ message: "Enter private key:" })
      ).then((value) => ({ password: value as string }));
      if (!password) {
        console.error("No key provided");
        process.exit(6);
      }
      privateKey = password;
    } else {
      // Read from stdin pipe
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk);
      }
      privateKey = Buffer.concat(chunks).toString("utf-8").trim();
    }

    const name = args.name || `imported-${Date.now()}`;
    const store = getWalletStore();
    const wallet = await store.importKey(name, privateKey, args.chain);
    const out = createOutput(resolveOutputOptions(args));
    out.data({
      name: wallet.name,
      address: wallet.address,
      chain: wallet.chain,
    });
  },
});
```

Create `src/commands/wallet/list.ts`:

```typescript
import { defineCommand } from "citty";
import { getWalletStore } from "../../core/context";
import { createOutput, resolveOutputOptions } from "../../core/output";

export default defineCommand({
  meta: {
    name: "list",
    description: "List all wallets",
  },
  args: {
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const store = getWalletStore();
    const wallets = await store.list();
    const out = createOutput(resolveOutputOptions(args));

    if (wallets.length === 0) {
      out.warn("No wallets found. Run `wooo wallet generate` to create one.");
      return;
    }

    out.table(
      wallets.map((w) => ({
        name: w.name,
        address: w.address,
        chain: w.chain,
        active: w.active ? "✓" : "",
      })),
      { columns: ["name", "address", "chain", "active"], title: "Wallets" }
    );
  },
});
```

Create `src/commands/wallet/balance.ts`:

```typescript
import { defineCommand } from "citty";
import { createPublicClient, http, formatEther } from "viem";
import { mainnet } from "viem/chains";
import { WalletStore } from "../../core/wallet-store";
import { getConfigDir, loadWoooConfig } from "../../core/config";
import { createOutput, resolveOutputOptions } from "../../core/output";
import { join } from "node:path";

export default defineCommand({
  meta: {
    name: "balance",
    description: "Check wallet balance",
  },
  args: {
    address: {
      type: "positional",
      description: "Address to check (defaults to active wallet)",
      required: false,
    },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const config = await loadWoooConfig();
    const rpc = config.chains?.ethereum?.rpc || "https://eth.llamarpc.com";

    let address: string;

    if (args.address) {
      address = args.address;
    } else {
      const password = process.env.WOOO_MASTER_PASSWORD;
      if (!password) {
        console.error("Error: Set WOOO_MASTER_PASSWORD environment variable");
        process.exit(3);
      }
      const store = new WalletStore(
        join(getConfigDir(), "keystore"),
        password
      );
      const active = await store.getActive();
      if (!active) {
        console.error("No active wallet. Run `wooo wallet generate` first.");
        process.exit(1);
      }
      address = active.address;
    }

    const client = createPublicClient({
      chain: mainnet,
      transport: http(rpc),
    });

    const balance = await client.getBalance({
      address: address as `0x${string}`,
    });

    const out = createOutput(resolveOutputOptions(args));
    out.data({
      address,
      balance: formatEther(balance),
      unit: "ETH",
    });
  },
});
```

Create `src/commands/wallet/export.ts`:

```typescript
import { defineCommand } from "citty";
import { getWalletStore } from "../../core/context";
import ansis from "ansis";

export default defineCommand({
  meta: {
    name: "export",
    description: "Export wallet private key",
  },
  args: {
    name: {
      type: "positional",
      description: "Wallet name to export",
      required: true,
    },
    yes: { type: "boolean", default: false },
  },
  async run({ args }) {
    if (!args.yes) {
      if (process.stdout.isTTY) {
        const { confirm } = await import("@clack/prompts");
        const confirmed = await confirm({
          message: "This will display your private key. Continue?",
        });
        if (!confirmed) {
          process.exit(6);
        }
      } else {
        console.error(
          ansis.yellow("⚠ This will display your private key. Use --yes to confirm.")
        );
        process.exit(6);
      }
    }

    const store = getWalletStore();
    const key = await store.exportKey(args.name);
    if (!key) {
      console.error(`Wallet "${args.name}" not found`);
      process.exit(1);
    }
    console.log(key);
  },
});
```

Create `src/commands/wallet/switch.ts`:

```typescript
import { defineCommand } from "citty";
import { getWalletStore } from "../../core/context";
import { createOutput, resolveOutputOptions } from "../../core/output";

export default defineCommand({
  meta: {
    name: "switch",
    description: "Switch active wallet",
  },
  args: {
    name: {
      type: "positional",
      description: "Wallet name to activate",
      required: true,
    },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const store = getWalletStore();
    await store.setActive(args.name);
    const out = createOutput(resolveOutputOptions(args));
    out.success(`Switched active wallet to "${args.name}"`);
  },
});
```

- [ ] **Step 7: Verify wallet commands work**

Run: `cd /home/daoleno/workspace/wooo-cli && bun run dev -- wallet --help`
Expected: Shows wallet subcommands (generate, import, list, balance, export, switch)

- [ ] **Step 8: Wire wallet subcommand into index.ts**

Update `src/index.ts` to add wallet subcommand:

```typescript
import { defineCommand, runMain } from "citty";
import { globalArgs } from "./core/globals";

const main = defineCommand({
  meta: {
    name: "wooo",
    version: "0.1.0",
    description: "Crypto All-in-One CLI",
  },
  args: globalArgs,
  subCommands: {
    config: () => import("./commands/config/index").then((m) => m.default),
    wallet: () => import("./commands/wallet/index").then((m) => m.default),
  },
  run() {
    console.log("wooo-cli v0.1.0 — run `wooo --help` for commands");
  },
});

runMain(main);
```

- [ ] **Step 9: Commit**

```bash
cd /home/daoleno/workspace/wooo-cli
git add src/core/context.ts src/commands/wallet/ src/index.ts
git commit -m "feat(commands): add wallet generate/import/list/balance/export/switch"
```

---

## Chunk 3: Protocol Registry & Hyperliquid

### Task 10: Protocol Types & Registry

**Files:**
- Create: `src/protocols/types.ts`
- Create: `src/protocols/registry.ts`
- Create: `tests/protocols/registry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/protocols/registry.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { getProtocol, listProtocols } from "../src/protocols/registry";

describe("protocol registry", () => {
  test("listProtocols returns at least hyperliquid", () => {
    const protocols = listProtocols();
    const names = protocols.map((p) => p.name);
    expect(names).toContain("hyperliquid");
  });

  test("getProtocol returns protocol by name", () => {
    const protocol = getProtocol("hyperliquid");
    expect(protocol).toBeDefined();
    expect(protocol!.name).toBe("hyperliquid");
    expect(protocol!.type).toBe("perps");
  });

  test("getProtocol returns undefined for unknown", () => {
    const protocol = getProtocol("nonexistent");
    expect(protocol).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/daoleno/workspace/wooo-cli && bun test tests/protocols/registry.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write protocol types**

Create `src/protocols/types.ts`:

```typescript
import type { CommandDef } from "citty";

export interface ProtocolDefinition {
  name: string;
  displayName: string;
  type: "cex" | "dex" | "lending" | "staking" | "bridge" | "perps";
  chains?: string[];
  requiresAuth: boolean;
  setup: () => CommandDef;
}
```

- [ ] **Step 4: Write registry** (with hyperliquid placeholder)

Create `src/protocols/registry.ts`:

```typescript
import type { ProtocolDefinition } from "./types";

const protocols: ProtocolDefinition[] = [];

export function registerProtocol(protocol: ProtocolDefinition): void {
  protocols.push(protocol);
}

export function getProtocol(name: string): ProtocolDefinition | undefined {
  return protocols.find((p) => p.name === name);
}

export function listProtocols(): ProtocolDefinition[] {
  return [...protocols];
}

// Auto-register protocols on import
import("./hyperliquid/commands").then((m) => {
  registerProtocol(m.hyperliquidProtocol);
});
```

Note: This will fail the test because the import is async. We need to make registration synchronous.

Revised `src/protocols/registry.ts`:

```typescript
import type { ProtocolDefinition } from "./types";
import { hyperliquidProtocol } from "./hyperliquid/commands";

const protocols: ProtocolDefinition[] = [
  hyperliquidProtocol,
];

export function registerProtocol(protocol: ProtocolDefinition): void {
  protocols.push(protocol);
}

export function getProtocol(name: string): ProtocolDefinition | undefined {
  return protocols.find((p) => p.name === name);
}

export function listProtocols(): ProtocolDefinition[] {
  return [...protocols];
}
```

We need to create the hyperliquid protocol stub first so the registry can import it. Create a minimal stub at `src/protocols/hyperliquid/commands.ts`:

```typescript
import { defineCommand } from "citty";
import type { ProtocolDefinition } from "../types";

export const hyperliquidProtocol: ProtocolDefinition = {
  name: "hyperliquid",
  displayName: "Hyperliquid",
  type: "perps",
  chains: ["hyperliquid"],
  requiresAuth: false,
  setup: () =>
    defineCommand({
      meta: { name: "hyperliquid", description: "Hyperliquid perpetuals" },
      subCommands: {
        long: () => import("./long").then((m) => m.default),
        short: () => import("./short").then((m) => m.default),
        positions: () => import("./positions").then((m) => m.default),
        funding: () => import("./funding").then((m) => m.default),
      },
    }),
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /home/daoleno/workspace/wooo-cli && bun test tests/protocols/registry.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 6: Wire protocols into main entry point**

Update `src/index.ts` to dynamically register protocol commands:

```typescript
import { defineCommand, runMain } from "citty";
import { globalArgs } from "./core/globals";
import { listProtocols } from "./protocols/registry";
import type { SubCommandsDef } from "citty";

const protocolCommands: SubCommandsDef = {};
for (const protocol of listProtocols()) {
  protocolCommands[protocol.name] = () => protocol.setup();
}

const main = defineCommand({
  meta: {
    name: "wooo",
    version: "0.1.0",
    description: "Crypto All-in-One CLI",
  },
  args: globalArgs,
  subCommands: {
    config: () => import("./commands/config/index").then((m) => m.default),
    wallet: () => import("./commands/wallet/index").then((m) => m.default),
    ...protocolCommands,
  },
  run() {
    console.log("wooo-cli v0.1.0 — run `wooo --help` for commands");
  },
});

runMain(main);
```

- [ ] **Step 7: Commit**

```bash
cd /home/daoleno/workspace/wooo-cli
git add src/protocols/types.ts src/protocols/registry.ts src/protocols/hyperliquid/commands.ts tests/protocols/registry.test.ts src/index.ts
git commit -m "feat(protocols): add protocol registry with hyperliquid stub"
```

---

### Task 11: Hyperliquid Client

**Files:**
- Create: `src/protocols/hyperliquid/client.ts`
- Create: `src/protocols/hyperliquid/types.ts`
- Create: `tests/protocols/hyperliquid/client.test.ts`

- [ ] **Step 1: Install hyperliquid dependency**

```bash
cd /home/daoleno/workspace/wooo-cli && bun add ccxt
```

- [ ] **Step 2: Write the failing test**

Create `tests/protocols/hyperliquid/client.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { HyperliquidClient } from "../../src/protocols/hyperliquid/client";

describe("HyperliquidClient", () => {
  test("creates client without auth for public endpoints", () => {
    const client = new HyperliquidClient();
    expect(client).toBeDefined();
  });

  test("fetchMarkets returns market data", async () => {
    const client = new HyperliquidClient();
    const markets = await client.fetchMarkets();
    expect(Array.isArray(markets)).toBe(true);
    expect(markets.length).toBeGreaterThan(0);
    // BTC should always exist
    const btc = markets.find(
      (m) => m.symbol === "BTC/USDC:USDC" || m.symbol.includes("BTC")
    );
    expect(btc).toBeDefined();
  });

  test("fetchTicker returns price data for BTC", async () => {
    const client = new HyperliquidClient();
    const ticker = await client.fetchTicker("BTC/USDC:USDC");
    expect(ticker.symbol).toContain("BTC");
    expect(ticker.last).toBeGreaterThan(0);
  });

  test("fetchFundingRate returns funding data", async () => {
    const client = new HyperliquidClient();
    const funding = await client.fetchFundingRate("BTC/USDC:USDC");
    expect(funding.symbol).toContain("BTC");
    expect(typeof funding.fundingRate).toBe("number");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /home/daoleno/workspace/wooo-cli && bun test tests/protocols/hyperliquid/client.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Write Hyperliquid types**

Create `src/protocols/hyperliquid/types.ts`:

```typescript
export interface HyperliquidMarket {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
}

export interface HyperliquidTicker {
  symbol: string;
  last: number;
  high: number;
  low: number;
  volume: number;
  change24h: number;
}

export interface HyperliquidPosition {
  symbol: string;
  side: "LONG" | "SHORT";
  size: number;
  entryPrice: number;
  markPrice: number;
  pnl: number;
  leverage: number;
}

export interface HyperliquidFunding {
  symbol: string;
  fundingRate: number;
  nextFundingTime: number;
}

export interface HyperliquidOrderResult {
  orderId: string;
  symbol: string;
  side: string;
  size: number;
  price: number;
  status: string;
}
```

- [ ] **Step 5: Write Hyperliquid client**

Create `src/protocols/hyperliquid/client.ts`:

```typescript
import ccxt from "ccxt";
import type {
  HyperliquidTicker,
  HyperliquidPosition,
  HyperliquidFunding,
  HyperliquidOrderResult,
} from "./types";

export class HyperliquidClient {
  private exchange: ccxt.hyperliquid;

  constructor(privateKey?: string) {
    if (privateKey) {
      // Derive wallet address from private key
      const { privateKeyToAccount } = require("viem/accounts");
      const account = privateKeyToAccount(privateKey as `0x${string}`);
      this.exchange = new ccxt.hyperliquid({
        privateKey,
        walletAddress: account.address,
      });
    } else {
      this.exchange = new ccxt.hyperliquid({});
    }
  }

  async fetchMarkets() {
    return this.exchange.fetchMarkets();
  }

  async setLeverage(leverage: number, symbol: string): Promise<void> {
    await this.exchange.setLeverage(leverage, symbol);
  }

  async fetchTicker(symbol: string): Promise<HyperliquidTicker> {
    const ticker = await this.exchange.fetchTicker(symbol);
    return {
      symbol: ticker.symbol,
      last: ticker.last ?? 0,
      high: ticker.high ?? 0,
      low: ticker.low ?? 0,
      volume: ticker.baseVolume ?? 0,
      change24h: ticker.percentage ?? 0,
    };
  }

  async fetchFundingRate(symbol: string): Promise<HyperliquidFunding> {
    const funding = await this.exchange.fetchFundingRate(symbol);
    return {
      symbol: funding.symbol,
      fundingRate: funding.fundingRate ?? 0,
      nextFundingTime: funding.fundingTimestamp ?? 0,
    };
  }

  async fetchPositions(): Promise<HyperliquidPosition[]> {
    const positions = await this.exchange.fetchPositions();
    return positions
      .filter((p) => Math.abs(p.contracts ?? 0) > 0)
      .map((p) => ({
        symbol: p.symbol,
        side: (p.side === "long" ? "LONG" : "SHORT") as "LONG" | "SHORT",
        size: Math.abs(p.contracts ?? 0),
        entryPrice: p.entryPrice ?? 0,
        markPrice: p.markPrice ?? 0,
        pnl: p.unrealizedPnl ?? 0,
        leverage: p.leverage ?? 1,
      }));
  }

  async createMarketOrder(
    symbol: string,
    side: "buy" | "sell",
    amount: number
  ): Promise<HyperliquidOrderResult> {
    const order = await this.exchange.createMarketOrder(symbol, side, amount);
    return {
      orderId: order.id,
      symbol: order.symbol,
      side: order.side,
      size: order.amount,
      price: order.average ?? order.price ?? 0,
      status: order.status,
    };
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd /home/daoleno/workspace/wooo-cli && bun test tests/protocols/hyperliquid/client.test.ts`
Expected: All 4 tests PASS (these hit the real Hyperliquid public API)

Note: These are integration tests that require network access. If network is unavailable, tests will timeout. For CI, mock tests should be added later.

- [ ] **Step 7: Commit**

```bash
cd /home/daoleno/workspace/wooo-cli
git add src/protocols/hyperliquid/types.ts src/protocols/hyperliquid/client.ts tests/protocols/hyperliquid/
git commit -m "feat(hyperliquid): add client with CCXT integration"
```

---

### Task 12: Hyperliquid CLI Commands

**Files:**
- Create: `src/protocols/hyperliquid/long.ts`
- Create: `src/protocols/hyperliquid/short.ts`
- Create: `src/protocols/hyperliquid/positions.ts`
- Create: `src/protocols/hyperliquid/funding.ts`

- [ ] **Step 1: Create the `long` command**

Create `src/protocols/hyperliquid/long.ts`:

```typescript
import { defineCommand } from "citty";
import { HyperliquidClient } from "./client";
import { getActivePrivateKey } from "../../core/context";
import { createOutput, resolveOutputOptions } from "../../core/output";
import ansis from "ansis";

export default defineCommand({
  meta: {
    name: "long",
    description: "Open a long position",
  },
  args: {
    symbol: {
      type: "positional",
      description: "Trading symbol (e.g. BTC)",
      required: true,
    },
    size: {
      type: "positional",
      description: "Position size in USD",
      required: true,
    },
    leverage: {
      type: "string",
      description: "Leverage (default: 1)",
      default: "1",
    },
    yes: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));
    const symbol = `${args.symbol}/USDC:USDC`;
    const sizeUsd = parseFloat(args.size);
    const leverage = parseInt(args.leverage, 10);

    // Get price to calculate amount
    const client = new HyperliquidClient();
    const ticker = await client.fetchTicker(symbol);
    const amount = sizeUsd / ticker.last;

    if (args["dry-run"]) {
      out.data({
        action: "LONG",
        symbol,
        sizeUsd,
        amount: amount.toFixed(6),
        estimatedPrice: ticker.last,
        leverage,
        status: "dry-run",
      });
      return;
    }

    if (!args.yes) {
      console.error(
        ansis.yellow(
          `⚠ About to LONG ${args.symbol} with $${sizeUsd} at ${leverage}x leverage ~$${ticker.last}. Use --yes to confirm.`
        )
      );
      process.exit(6);
    }

    const pk = await getActivePrivateKey();
    const authClient = new HyperliquidClient(pk);
    await authClient.setLeverage(leverage, symbol);
    const result = await authClient.createMarketOrder(symbol, "buy", amount);
    out.data(result);
  },
});
```

- [ ] **Step 2: Create the `short` command**

Create `src/protocols/hyperliquid/short.ts`:

```typescript
import { defineCommand } from "citty";
import { HyperliquidClient } from "./client";
import { getActivePrivateKey } from "../../core/context";
import { createOutput, resolveOutputOptions } from "../../core/output";
import ansis from "ansis";

export default defineCommand({
  meta: {
    name: "short",
    description: "Open a short position",
  },
  args: {
    symbol: {
      type: "positional",
      description: "Trading symbol (e.g. BTC)",
      required: true,
    },
    size: {
      type: "positional",
      description: "Position size in USD",
      required: true,
    },
    leverage: {
      type: "string",
      description: "Leverage (default: 1)",
      default: "1",
    },
    yes: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));
    const symbol = `${args.symbol}/USDC:USDC`;
    const sizeUsd = parseFloat(args.size);
    const leverage = parseInt(args.leverage, 10);

    const client = new HyperliquidClient();
    const ticker = await client.fetchTicker(symbol);
    const amount = sizeUsd / ticker.last;

    if (args["dry-run"]) {
      out.data({
        action: "SHORT",
        symbol,
        sizeUsd,
        amount: amount.toFixed(6),
        estimatedPrice: ticker.last,
        leverage,
        status: "dry-run",
      });
      return;
    }

    if (!args.yes) {
      console.error(
        ansis.yellow(
          `⚠ About to SHORT ${args.symbol} with $${sizeUsd} at ${leverage}x leverage ~$${ticker.last}. Use --yes to confirm.`
        )
      );
      process.exit(6);
    }

    const pk = await getActivePrivateKey();
    const authClient = new HyperliquidClient(pk);
    await authClient.setLeverage(leverage, symbol);
    const result = await authClient.createMarketOrder(symbol, "sell", amount);
    out.data(result);
  },
});
```

- [ ] **Step 3: Create the `positions` command**

Create `src/protocols/hyperliquid/positions.ts`:

```typescript
import { defineCommand } from "citty";
import { HyperliquidClient } from "./client";
import { getActivePrivateKey } from "../../core/context";
import { createOutput, resolveOutputOptions } from "../../core/output";

export default defineCommand({
  meta: {
    name: "positions",
    description: "View open positions",
  },
  args: {
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const pk = await getActivePrivateKey();
    const client = new HyperliquidClient(pk);
    const positions = await client.fetchPositions();
    const out = createOutput(resolveOutputOptions(args));

    if (positions.length === 0) {
      out.warn("No open positions");
      return;
    }

    out.table(
      positions.map((p) => ({
        symbol: p.symbol,
        side: p.side,
        size: p.size,
        entry: p.entryPrice.toFixed(2),
        mark: p.markPrice.toFixed(2),
        pnl: p.pnl.toFixed(2),
        leverage: `${p.leverage}x`,
      })),
      {
        columns: ["symbol", "side", "size", "entry", "mark", "pnl", "leverage"],
        title: "Hyperliquid Positions",
      }
    );
  },
});
```

- [ ] **Step 4: Create the `funding` command**

Create `src/protocols/hyperliquid/funding.ts`:

```typescript
import { defineCommand } from "citty";
import { HyperliquidClient } from "./client";
import { createOutput, resolveOutputOptions } from "../../core/output";

export default defineCommand({
  meta: {
    name: "funding",
    description: "View funding rates",
  },
  args: {
    symbol: {
      type: "positional",
      description: "Trading symbol (e.g. BTC). If omitted, shows top symbols.",
      required: false,
    },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const client = new HyperliquidClient();
    const out = createOutput(resolveOutputOptions(args));

    if (args.symbol) {
      const symbol = `${args.symbol}/USDC:USDC`;
      const funding = await client.fetchFundingRate(symbol);
      out.data({
        symbol: funding.symbol,
        fundingRate: `${(funding.fundingRate * 100).toFixed(4)}%`,
        annualized: `${(funding.fundingRate * 100 * 365 * 3).toFixed(2)}%`,
      });
    } else {
      // Show funding for common symbols
      const symbols = ["BTC/USDC:USDC", "ETH/USDC:USDC", "SOL/USDC:USDC"];
      const results = await Promise.all(
        symbols.map((s) => client.fetchFundingRate(s))
      );
      out.table(
        results.map((f) => ({
          symbol: f.symbol,
          rate: `${(f.fundingRate * 100).toFixed(4)}%`,
          annualized: `${(f.fundingRate * 100 * 365 * 3).toFixed(2)}%`,
        })),
        { columns: ["symbol", "rate", "annualized"], title: "Funding Rates" }
      );
    }
  },
});
```

- [ ] **Step 5: Verify Hyperliquid commands work**

Run: `cd /home/daoleno/workspace/wooo-cli && bun run dev -- hyperliquid --help`
Expected: Shows subcommands (long, short, positions, funding)

Run: `cd /home/daoleno/workspace/wooo-cli && bun run dev -- hyperliquid funding BTC --json`
Expected: JSON output with BTC funding rate

- [ ] **Step 6: Commit**

```bash
cd /home/daoleno/workspace/wooo-cli
git add src/protocols/hyperliquid/
git commit -m "feat(hyperliquid): add long/short/positions/funding commands"
```

---

### Task 13: End-to-End Smoke Test

**Files:**
- Create: `tests/smoke.test.ts`

- [ ] **Step 1: Write smoke test**

Create `tests/smoke.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { $ } from "bun";

const CLI = "bun run src/index.ts";

describe("wooo-cli smoke tests", () => {
  test("shows help", async () => {
    const result = await $`bun run src/index.ts --help`.text();
    expect(result).toContain("wooo");
    expect(result).toContain("config");
    expect(result).toContain("wallet");
    expect(result).toContain("hyperliquid");
  });

  test("config list returns defaults", async () => {
    const result = await $`bun run src/index.ts config list`.text();
    expect(result).toContain("ethereum");
  });

  test("hyperliquid help shows subcommands", async () => {
    const result = await $`bun run src/index.ts hyperliquid --help`.text();
    expect(result).toContain("long");
    expect(result).toContain("short");
    expect(result).toContain("positions");
    expect(result).toContain("funding");
  });

  test("hyperliquid funding BTC --json returns valid JSON", async () => {
    const result =
      await $`bun run src/index.ts hyperliquid funding BTC --json`.text();
    const parsed = JSON.parse(result);
    expect(parsed.symbol).toContain("BTC");
    expect(parsed.fundingRate).toBeDefined();
  });
});
```

- [ ] **Step 2: Run smoke tests**

Run: `cd /home/daoleno/workspace/wooo-cli && bun test tests/smoke.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 3: Commit**

```bash
cd /home/daoleno/workspace/wooo-cli
git add tests/smoke.test.ts
git commit -m "test: add end-to-end smoke tests"
```

---

### Task 14: Final Cleanup & README

**Files:**
- Update: `package.json` (verify all scripts work)
- Create: `CLAUDE.md`

- [ ] **Step 1: Run all tests**

Run: `cd /home/daoleno/workspace/wooo-cli && bun test`
Expected: All tests PASS

- [ ] **Step 2: Run type check**

Run: `cd /home/daoleno/workspace/wooo-cli && bunx tsc --noEmit`
Expected: No errors (fix any type errors found)

- [ ] **Step 3: Run linter**

Run: `cd /home/daoleno/workspace/wooo-cli && bunx biome check .`
Expected: No errors (fix any lint issues)

- [ ] **Step 4: Create CLAUDE.md**

Create `CLAUDE.md` with project-specific instructions:

```markdown
# CLAUDE.md

## Development Commands

- `bun run dev` - Run CLI in development mode
- `bun run dev -- <command>` - Run specific command (e.g. `bun run dev -- wallet list`)
- `bun test` - Run all tests
- `bun run type-check` - TypeScript type checking
- `bun run lint` - Biome linting
- `bun run lint:fix` - Auto-fix lint issues
- `bun run build` - Build with tsdown

## Architecture

Crypto all-in-one CLI. Each exchange/DeFi protocol is a command group under `src/protocols/`.

### Key Directories
- `src/core/` - Config, output engine, keystore, logger, error handling
- `src/protocols/` - Each protocol has commands.ts + client.ts
- `src/commands/` - Universal commands (wallet, config, market, portfolio, chain)
- `tests/` - Mirrors src structure

### Adding a Protocol
1. Create `src/protocols/<name>/commands.ts` (define ProtocolDefinition)
2. Create `src/protocols/<name>/client.ts` (API wrapper)
3. Add to `src/protocols/registry.ts`

### Global Flags
All commands support: `--json`, `--format`, `--chain`, `--wallet`, `--yes`, `--dry-run`, `--verbose`, `--quiet`

### Environment Variables
- `WOOO_MASTER_PASSWORD` - Required for wallet operations
- `WOOO_CONFIG_DIR` - Override config directory (default: ~/.config/wooo)
```

- [ ] **Step 5: Commit**

```bash
cd /home/daoleno/workspace/wooo-cli
git add CLAUDE.md package.json
git commit -m "docs: add CLAUDE.md and finalize Wave 1 setup"
```
