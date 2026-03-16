import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONFIG_DEFAULTS } from "../../src/core/config";
import { WalletStore } from "../../src/core/wallet-store";

const MASTER_PASSWORD = "wooo-anvil-e2e-password";
const DEFAULT_ETHEREUM_FORK_URL = "https://ethereum.publicnode.com";
const DEFAULT_READY_TIMEOUT_MS = 90_000;
const READY_POLL_INTERVAL_MS = 250;
const MAX_CAPTURED_LOG_CHARS = 8_000;

export const ANVIL_DEFAULT_ADDRESS =
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
export const ANVIL_DEFAULT_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
export const ETHEREUM_USDC_ADDRESS =
  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
export const ETHEREUM_USDT_ADDRESS =
  "0xdAC17F958D2ee523a2206206994597C13D831ec7";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getReadyTimeoutMs(): number {
  const rawTimeout = process.env.ANVIL_READY_TIMEOUT_MS?.trim();
  if (!rawTimeout) {
    return DEFAULT_READY_TIMEOUT_MS;
  }

  const timeoutMs = Number.parseInt(rawTimeout, 10);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(
      `ANVIL_READY_TIMEOUT_MS must be a positive integer, got "${rawTimeout}"`,
    );
  }

  return timeoutMs;
}

function formatCapturedLog(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return "<empty>";
  }

  if (trimmed.length <= MAX_CAPTURED_LOG_CHARS) {
    return trimmed;
  }

  return `[truncated to last ${MAX_CAPTURED_LOG_CHARS} chars]\n${trimmed.slice(
    -MAX_CAPTURED_LOG_CHARS,
  )}`;
}

function readPipe(
  pipe: ReadableStream<Uint8Array> | null | undefined,
  label: string,
): Promise<string> {
  if (!pipe) {
    return Promise.resolve("");
  }

  return new Response(pipe).text().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    return `<failed to capture ${label}: ${message}>`;
  });
}

function createStartupError(
  url: string,
  reason: string,
  exitCode: number | null,
  stdout: string,
  stderr: string,
): Error {
  const lines = [
    `Anvil failed to become ready at ${url}.`,
    `Reason: ${reason}`,
  ];

  if (exitCode !== null) {
    lines.push(`Exit code: ${exitCode}`);
  }

  lines.push(`stderr:\n${formatCapturedLog(stderr)}`);
  lines.push(`stdout:\n${formatCapturedLog(stdout)}`);

  return new Error(lines.join("\n\n"));
}

async function findFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Could not determine a free TCP port"));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(address.port);
      });
    });
  });
}

async function waitForRpc(
  url: string,
  timeoutMs: number,
  getExitCode: () => number | null,
): Promise<void> {
  const startedAt = Date.now();
  let lastError = "RPC endpoint did not respond";

  while (Date.now() - startedAt < timeoutMs) {
    const exitCode = getExitCode();
    if (exitCode !== null) {
      throw new Error(
        `Anvil exited before RPC became ready at ${url} (exit code ${exitCode})`,
      );
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_chainId",
          params: [],
        }),
      });

      if (response.ok) {
        const payload = (await response.json()) as {
          error?: { message?: string };
          result?: string;
        };

        if (payload.result) {
          return;
        }

        lastError =
          payload.error?.message || "RPC ready check returned no data";
      } else {
        lastError = `HTTP ${response.status}`;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    const exitCodeAfterPoll = getExitCode();
    if (exitCodeAfterPoll !== null) {
      throw new Error(
        `Anvil exited before RPC became ready at ${url} (exit code ${exitCodeAfterPoll})`,
      );
    }

    await sleep(READY_POLL_INTERVAL_MS);
  }

  throw new Error(
    `Anvil RPC did not become ready at ${url} within ${timeoutMs}ms: ${lastError}`,
  );
}

export class EthereumAnvilHarness {
  readonly address = ANVIL_DEFAULT_ADDRESS;
  readonly privateKey = ANVIL_DEFAULT_PRIVATE_KEY;

  private anvil?: Bun.Subprocess;
  private configDir?: string;
  private rpcUrl?: string;

  async start(): Promise<void> {
    const anvilPath = Bun.which("anvil");
    if (!anvilPath) {
      throw new Error("Foundry `anvil` was not found on PATH");
    }

    const forkUrl =
      process.env.ANVIL_FORK_URL_ETHEREUM || DEFAULT_ETHEREUM_FORK_URL;
    if (!forkUrl) {
      throw new Error(
        "No Ethereum fork URL configured. Set ANVIL_FORK_URL_ETHEREUM.",
      );
    }

    const port = await findFreePort();
    const readyTimeoutMs = getReadyTimeoutMs();
    this.rpcUrl = `http://127.0.0.1:${port}`;

    const cmd = [anvilPath, "--fork-url", forkUrl, "--port", String(port)];
    const forkBlockNumber = process.env.ANVIL_FORK_BLOCK_NUMBER?.trim();
    if (forkBlockNumber) {
      cmd.push("--fork-block-number", forkBlockNumber);
    }
    cmd.push("--chain-id", "1", "--silent");

    this.anvil = Bun.spawn({
      cmd,
      cwd: process.cwd(),
      env: process.env,
      stdout: "pipe",
      stderr: "pipe",
    });

    let anvilExitCode: number | null = null;
    const anvilExited = this.anvil.exited.then((exitCode) => {
      anvilExitCode = exitCode;
      return exitCode;
    });
    const anvilStdout = readPipe(this.anvil.stdout, "anvil stdout");
    const anvilStderr = readPipe(this.anvil.stderr, "anvil stderr");

    try {
      await waitForRpc(this.rpcUrl, readyTimeoutMs, () => anvilExitCode);
    } catch (error) {
      if (anvilExitCode === null) {
        this.anvil.kill();
      }

      await anvilExited;

      const [stdout, stderr] = await Promise.all([anvilStdout, anvilStderr]);
      const reason = error instanceof Error ? error.message : String(error);
      throw createStartupError(
        this.rpcUrl,
        reason,
        anvilExitCode,
        stdout,
        stderr,
      );
    }

    this.configDir = mkdtempSync(join(tmpdir(), "wooo-anvil-e2e-"));
    writeFileSync(
      join(this.configDir, "wooo.config.json"),
      JSON.stringify(
        {
          ...CONFIG_DEFAULTS,
          default: {
            ...CONFIG_DEFAULTS.default,
            chain: "ethereum",
            format: "json",
            wallet: "anvil-default",
          },
          chains: {
            ...CONFIG_DEFAULTS.chains,
            ethereum: { rpc: this.rpcUrl },
          },
        },
        null,
        2,
      ),
    );

    const walletStore = new WalletStore(
      join(this.configDir, "keystore"),
      MASTER_PASSWORD,
    );
    await walletStore.importKey("anvil-default", this.privateKey, "evm");
    await walletStore.setActive("anvil-default");
  }

  async stop(): Promise<void> {
    if (this.anvil) {
      this.anvil.kill();
      await this.anvil.exited;
      this.anvil = undefined;
    }

    if (this.configDir) {
      rmSync(this.configDir, { recursive: true, force: true });
      this.configDir = undefined;
    }
  }

  async runCli(args: string[]): Promise<string> {
    if (!this.configDir) {
      throw new Error("EthereumAnvilHarness.start() must be called first");
    }

    const proc = Bun.spawn({
      cmd: [process.execPath, "run", "src/index.ts", ...args],
      cwd: process.cwd(),
      env: {
        ...process.env,
        WOOO_CONFIG_DIR: this.configDir,
        WOOO_MASTER_PASSWORD: MASTER_PASSWORD,
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    if (exitCode !== 0) {
      throw new Error(
        `Command failed with exit code ${exitCode}: bun run src/index.ts ${args.join(
          " ",
        )}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
      );
    }

    return stdout.trim();
  }

  async runJson<T>(args: string[]): Promise<T> {
    const stdout = await this.runCli([...args, "--json"]);
    return JSON.parse(stdout) as T;
  }
}
