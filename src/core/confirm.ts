import * as clack from "@clack/prompts";
import ansis from "ansis";

export interface TransactionPreview {
  action: string;
  details: Record<string, string | number>;
}

/**
 * Show a transaction preview and prompt for confirmation.
 * If --yes is passed, skip the prompt.
 * If --dry-run is passed, display preview and return false.
 * In non-TTY mode (piped/AI agent), require --yes explicitly.
 */
export async function confirmTransaction(
  preview: TransactionPreview,
  opts: { yes?: boolean; "dry-run"?: boolean },
): Promise<boolean> {
  // Build preview display
  const lines = [
    ansis.bold(`${preview.action}`),
    ...Object.entries(preview.details).map(
      ([key, val]) => `  ${ansis.dim(key + ":")} ${val}`,
    ),
  ];
  console.error(lines.join("\n"));

  if (opts["dry-run"]) {
    console.error(ansis.dim("\n[dry-run] No transaction executed."));
    return false;
  }

  if (opts.yes) {
    return true;
  }

  // Non-TTY (piped input / AI agent) — require --yes
  if (!process.stdin.isTTY) {
    console.error(
      ansis.yellow("⚠ Non-interactive mode. Use --yes to confirm."),
    );
    process.exit(6);
  }

  // Interactive prompt
  const confirmed = await clack.confirm({
    message: "Proceed with this transaction?",
  });

  if (clack.isCancel(confirmed) || !confirmed) {
    console.error(ansis.dim("Transaction cancelled."));
    process.exit(6);
  }

  return true;
}
