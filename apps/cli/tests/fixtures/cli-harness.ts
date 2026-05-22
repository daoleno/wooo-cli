import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export class CliHarness {
  readonly configDir: string;

  constructor(prefix = "wooo-cli-test-") {
    this.configDir = mkdtempSync(join(tmpdir(), prefix));
  }

  cleanup(): void {
    rmSync(this.configDir, { recursive: true, force: true });
  }

  writeConfig(config: Record<string, unknown>): void {
    writeFileSync(
      join(this.configDir, "wooo.config.json"),
      JSON.stringify(config, null, 2),
    );
  }

  async run(
    args: string[],
    options?: {
      env?: Record<string, string | undefined>;
    },
  ): Promise<{ exitCode: number; stderr: string; stdout: string }> {
    const proc = Bun.spawn({
      cmd: [process.execPath, "run", "src/index.ts", ...args],
      cwd: process.cwd(),
      env: {
        ...process.env,
        WOOO_CONFIG_DIR: this.configDir,
        ...options?.env,
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    return { stdout, stderr, exitCode };
  }

  async runCli(
    args: string[],
    options?: {
      env?: Record<string, string | undefined>;
    },
  ): Promise<string> {
    const result = await this.run(args, options);

    if (result.exitCode !== 0) {
      throw new Error(
        `Command failed with exit code ${result.exitCode}: bun run src/index.ts ${args.join(
          " ",
        )}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      );
    }

    return result.stdout;
  }

  async runJson<T>(
    args: string[],
    options?: {
      env?: Record<string, string | undefined>;
    },
  ): Promise<T> {
    return JSON.parse(await this.runCli(args, options)) as T;
  }
}
