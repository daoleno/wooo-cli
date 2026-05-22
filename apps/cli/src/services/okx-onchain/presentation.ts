import {
  describeOkxOnchainChainIndex,
  type OkxOnchainBalanceAsset,
  type OkxOnchainTransactionDetailParty,
  type OkxOnchainTransferParty,
} from "./client";

function toFiniteNumber(value: string | number | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatOkxOnchainChainLabel(chainIndex: string): string {
  return describeOkxOnchainChainIndex(chainIndex);
}

export function formatOkxOnchainPercent(
  value: string | number | undefined,
): string {
  const parsed = toFiniteNumber(value);
  if (parsed === null) {
    return "";
  }
  const sign = parsed > 0 ? "+" : "";
  return `${sign}${parsed.toFixed(2)}%`;
}

export function formatOkxOnchainTimestamp(
  value: string | number | undefined,
): string {
  const parsed = toFiniteNumber(value);
  if (parsed === null) {
    return "";
  }
  return new Date(parsed).toISOString();
}

export function formatOkxOnchainUsd(
  value: string | number | undefined,
  digits = 2,
): string {
  const parsed = toFiniteNumber(value);
  if (parsed === null) {
    return "";
  }
  return `$${parsed.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: parsed === 0 ? 0 : Math.min(2, digits),
  })}`;
}

export function formatOkxOnchainAmount(
  value: string | number | undefined,
  digits = 6,
): string {
  const parsed = toFiniteNumber(value);
  if (parsed === null) {
    return "";
  }
  return parsed.toLocaleString(undefined, {
    maximumFractionDigits: digits,
  });
}

export function estimateOkxOnchainUsdValue(
  asset: Pick<OkxOnchainBalanceAsset, "balance" | "tokenPrice">,
): string {
  const balance = toFiniteNumber(asset.balance);
  const tokenPrice = toFiniteNumber(asset.tokenPrice);
  if (balance === null || tokenPrice === null) {
    return "";
  }
  return formatOkxOnchainUsd(balance * tokenPrice);
}

function collectAddresses(
  parties:
    | OkxOnchainTransferParty[]
    | OkxOnchainTransactionDetailParty[]
    | undefined,
): string {
  const addresses = Array.from(
    new Set(
      (parties ?? [])
        .map((party) => party.address?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
  return addresses.join(", ");
}

export function summarizeOkxOnchainAddresses(
  parties:
    | OkxOnchainTransferParty[]
    | OkxOnchainTransactionDetailParty[]
    | undefined,
): string {
  return collectAddresses(parties);
}
