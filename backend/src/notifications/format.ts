/** Escapes text for HTML element content and quoted attribute values. */
export function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

/**
 * Turns an untrusted payload value into single-line display text: strings and finite numbers only,
 * control characters and runs of whitespace collapsed, capped in length.
 */
export function cleanText(value: unknown, maxLength = 200): string | undefined {
  const raw = typeof value === "string" ? value : typeof value === "number" && Number.isFinite(value) ? String(value) : "";
  // C0/C1 control characters become spaces; \s also covers the Unicode line and paragraph separators.
  const text = raw.replace(/[\x00-\x1F\x7F-\x9F]+/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? "";
}

function minorUnits(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isSafeInteger(value) ? value : undefined;
  if (typeof value === "string" && /^-?\d{1,15}$/.test(value.trim())) return Number(value.trim());
  return undefined;
}

/**
 * Mirrors formatMoney in frontend/src/lib/format.ts so an email shows the same figure as the app
 * (PKR 240000 minor units -> "Rs 2,400", with a no-break space). Returns undefined when the amount
 * or currency is missing or invalid: showing no amount is better than showing a wrong one.
 */
export function formatMoney(amountMinor: unknown, currency: unknown): string | undefined {
  const minor = minorUnits(amountMinor);
  if (minor === undefined || typeof currency !== "string" || !/^[A-Za-z]{3}$/.test(currency.trim())) return undefined;
  try {
    return new Intl.NumberFormat("en-PK", { style: "currency", currency: currency.trim().toUpperCase(), maximumFractionDigits: 0 }).format(minor / 100);
  } catch {
    return undefined;
  }
}

/** "14 September 2026" (like formatLongDate in the app) for an ISO date ("2026-09-14") or timestamp. Undefined when the value does not parse. */
export function formatEmailDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
  const date = new Date(dateOnly ? `${trimmed}T12:00:00Z` : trimmed);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}
