import { readFileSync } from "node:fs";

export interface SignerSecretOptions {
  secretFile?: string;
}

export function getFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  const value = args[index + 1];
  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

export async function promptForSecret(): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error(
      "Set --secret-file, WOOO_SIGNER_SECRET_FILE, or WOOO_SIGNER_SECRET for reference signer usage",
    );
  }

  const clack = await import("@clack/prompts");
  const value = await clack.password({
    message: "Enter signer secret:",
  });
  if (!value || typeof value === "symbol") {
    throw new Error("No signer secret provided");
  }
  return value;
}

export async function resolveSignerSecret(
  options: SignerSecretOptions = {},
): Promise<string> {
  const candidatePath =
    options.secretFile || process.env.WOOO_SIGNER_SECRET_FILE;
  if (candidatePath) {
    return readFileSync(candidatePath, "utf-8").trim();
  }

  if (process.env.WOOO_SIGNER_SECRET) {
    return process.env.WOOO_SIGNER_SECRET;
  }

  return await promptForSecret();
}
