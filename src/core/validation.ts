import { z } from "zod";
import { formatSupportedChains, normalizeChainName } from "./chains";

// --- Zod Schemas ---

/** Positive, finite number from string input */
export const AmountSchema = z.string().transform((val) => {
  const n = Number.parseFloat(val);
  if (Number.isNaN(n))
    throw new Error(`Invalid amount: "${val}" is not a number`);
  if (!Number.isFinite(n))
    throw new Error(`Invalid amount: "${val}" is not finite`);
  if (n <= 0) throw new Error(`Invalid amount: ${val} must be greater than 0`);
  return n;
});

/** Positive integer leverage in range [1, 200] */
export const LeverageSchema = z.string().transform((val) => {
  const n = Number.parseInt(val, 10);
  if (Number.isNaN(n))
    throw new Error(`Invalid leverage: "${val}" is not a number`);
  if (n < 1 || n > 200)
    throw new Error(`Invalid leverage: ${n} must be between 1 and 200`);
  return n;
});

/** Non-empty token symbol, uppercased */
export const TokenSymbolSchema = z
  .string()
  .min(1, "Token symbol cannot be empty")
  .transform((val) => val.trim().toUpperCase());

/** Trading pair with separator (e.g. BTC/USDT) */
export const PairSchema = z.string().refine((val) => val.includes("/"), {
  message: 'Trading pair must contain "/" (e.g. BTC/USDT)',
});

/** Chain name validated against a supported list */
export function chainSchema(supported: string[]) {
  return z
    .string()
    .transform(normalizeChainName)
    .refine((val) => supported.includes(val), {
      message: `Unsupported chain. Available: ${formatSupportedChains(supported)}`,
    });
}

// --- Convenience Validators ---

/**
 * Parse and validate an amount string. Exits with clear error on failure.
 * Use at command entry points before any processing.
 */
export function validateAmount(value: string, label = "Amount"): number {
  const result = AmountSchema.safeParse(value);
  if (!result.success) {
    const msg = result.error.issues[0]?.message ?? `Invalid ${label}`;
    console.error(`Error: ${msg}`);
    process.exit(1);
  }
  return result.data;
}

/**
 * Parse and validate leverage string.
 */
export function validateLeverage(value: string): number {
  const result = LeverageSchema.safeParse(value);
  if (!result.success) {
    const msg = result.error.issues[0]?.message ?? "Invalid leverage";
    console.error(`Error: ${msg}`);
    process.exit(1);
  }
  return result.data;
}

/**
 * Validate and normalize a token symbol.
 */
export function validateTokenSymbol(value: string, label = "Token"): string {
  const result = TokenSymbolSchema.safeParse(value);
  if (!result.success) {
    const msg = result.error.issues[0]?.message ?? `Invalid ${label}`;
    console.error(`Error: ${msg}`);
    process.exit(1);
  }
  return result.data;
}

/**
 * Validate a trading pair format.
 */
export function validatePair(value: string): string {
  const result = PairSchema.safeParse(value);
  if (!result.success) {
    const msg = result.error.issues[0]?.message ?? "Invalid trading pair";
    console.error(`Error: ${msg}`);
    process.exit(1);
  }
  return result.data;
}

/**
 * Validate chain against supported list.
 */
export function validateChain(value: string, supported: string[]): string {
  const schema = chainSchema(supported);
  const result = schema.safeParse(value);
  if (!result.success) {
    const msg = result.error.issues[0]?.message ?? "Unsupported chain";
    console.error(`Error: ${msg}`);
    process.exit(1);
  }
  return result.data;
}

// --- Number Formatting for Financial Output ---

/**
 * Format a number as USD with 2 decimal places.
 */
export function formatUSD(n: number): string {
  if (!Number.isFinite(n)) return "N/A";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Format a crypto amount with appropriate precision.
 */
export function formatCrypto(n: number, decimals = 6): string {
  if (!Number.isFinite(n)) return "N/A";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

/**
 * Safe JSON serializer that replaces NaN/Infinity with null.
 */
export function safeJsonStringify(obj: unknown, indent = 2): string {
  return JSON.stringify(
    obj,
    (_key, value) => {
      if (typeof value === "bigint") return value.toString();
      if (typeof value === "number" && !Number.isFinite(value)) return null;
      return value;
    },
    indent,
  );
}
