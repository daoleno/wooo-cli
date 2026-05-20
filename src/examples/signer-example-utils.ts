import {
  readSecretRefEnv,
  requireSecret,
  validateSecretRef,
} from "../core/secrets";

export interface SignerSecretOptions {
  secretRef?: string;
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
      "Set --secret-ref or WOOO_SIGNER_SECRET_REF for reference signer usage",
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
  const ref =
    validateSecretRef(options.secretRef, "signer secret") ||
    readSecretRefEnv("WOOO_SIGNER_SECRET_REF", "signer secret");
  if (ref) {
    return (await requireSecret(ref, "signer secret")).reveal();
  }

  return await promptForSecret();
}
