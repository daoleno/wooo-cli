function toFiniteNumber(value: number | string | undefined): number | null {
  if (value === undefined) {
    return null;
  }

  const parsed =
    typeof value === "number" ? value : Number.parseFloat(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatOkxAgentAmount(
  value: number | string | undefined,
  digits = 4,
): string {
  const parsed = toFiniteNumber(value);
  if (parsed === null) {
    return "";
  }

  return parsed.toLocaleString(undefined, {
    maximumFractionDigits: digits,
  });
}

export function formatOkxAgentPercent(
  value: number | string | undefined,
): string {
  const parsed = toFiniteNumber(value);
  if (parsed === null) {
    return "";
  }

  const sign = parsed > 0 ? "+" : "";
  return `${sign}${parsed.toFixed(2)}%`;
}

export function formatOkxAgentTimestamp(
  value: number | string | undefined,
): string {
  const parsed = toFiniteNumber(value);
  if (parsed === null) {
    return "";
  }

  return new Date(parsed).toISOString();
}

export function formatOkxAgentUsd(
  value: number | string | undefined,
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

export function truncateOkxAgentText(value: unknown, max = 120): string {
  const text = String(value ?? "").trim();
  if (text.length <= max) {
    return text;
  }

  return `${text.slice(0, Math.max(0, max - 1))}…`;
}
