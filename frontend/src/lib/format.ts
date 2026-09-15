export function formatMoney(minor: number, currency = "PKR") {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(minor / 100);
}

export function formatShortDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export function formatLongDate(value: string) {
  const date = dateFromIso(value);
  if (Number.isNaN(date.getTime())) return value;
  const parts = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long", year: "numeric" }).formatToParts(date);
  const day = parts.find((part) => part.type === "day")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const year = parts.find((part) => part.type === "year")?.value;
  return day && month && year ? `${day} ${month} ${year}` : value;
}

export function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function dateFromIso(value: string) {
  return new Date(`${value}T12:00:00`);
}

export function dateToIso(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function toMinorUnits(value: string) {
  const amount = Number(value.replace(/,/g, ""));
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

export function todayDate() {
  return dateToIso(new Date());
}

// ---------------------------------------------------------------------------
// Redesign helpers (additive). Calendar maths runs on local noon dates so a
// daylight-saving jump can never move a day; labels use the device locale.
// ---------------------------------------------------------------------------

/** U+2212 MINUS SIGN, used in front of every negative money amount. */
export const MINUS = "\u2212";

const EN_DASH = "\u2013";
const DAY_MS = 86400000;

function parseYearMonth(ym: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})/.exec(ym);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || month < 1 || month > 12) return null;
  return { year, month };
}

function isValidDate(value: Date) {
  return !Number.isNaN(value.getTime());
}

function datePart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return parts.find((part) => part.type === type)?.value;
}

function dayAndMonth(value: Date, month: "short" | "long") {
  const parts = new Intl.DateTimeFormat(undefined, { day: "numeric", month }).formatToParts(value);
  return { day: datePart(parts, "day"), month: datePart(parts, "month") };
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

/** `minor` is a magnitude; the sign is explicit. "-" renders U+2212, "none" renders no sign. */
export function formatSignedMoney(minor: number, currency: string, sign: "+" | "-" | "none"): string {
  const amount = formatMoney(Number.isFinite(minor) ? Math.abs(minor) : 0, currency);
  if (sign === "+") return `+${amount}`;
  if (sign === "-") return `${MINUS}${amount}`;
  return amount;
}

export function addDaysIso(iso: string, days: number): string {
  const date = dateFromIso(iso);
  if (!isValidDate(date) || !Number.isFinite(days)) return iso;
  date.setDate(date.getDate() + Math.trunc(days));
  return dateToIso(date);
}

/** Whole calendar days from `from` to `to` (positive when `to` is later). Invalid input gives 0. */
export function isoDayDiff(from: string, to: string): number {
  const start = dateFromIso(from);
  const end = dateFromIso(to);
  if (!isValidDate(start) || !isValidDate(end)) return 0;
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
}

/** Shifts a "YYYY-MM" (a full ISO date is accepted) by whole months and returns "YYYY-MM". */
export function shiftMonth(ym: string, months: number): string {
  const parsed = parseYearMonth(ym);
  if (!parsed || !Number.isFinite(months)) return ym;
  const index = parsed.year * 12 + (parsed.month - 1) + Math.trunc(months);
  const year = Math.floor(index / 12);
  const month = index - year * 12 + 1;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

/** Number of days in the month ("YYYY-MM"). Invalid input gives 0. */
export function lastDayOfMonth(ym: string): number {
  const parsed = parseYearMonth(ym);
  if (!parsed) return 0;
  return new Date(parsed.year, parsed.month, 0, 12).getDate();
}

export function formatWeekday(iso: string, style: "short" | "long"): string {
  const date = dateFromIso(iso);
  if (!isValidDate(date)) return iso;
  return new Intl.DateTimeFormat(undefined, { weekday: style }).format(date);
}

export function formatMonth(ym: string, style: "narrow" | "short" | "long", withYear?: boolean): string {
  const parsed = parseYearMonth(ym);
  if (!parsed) return ym;
  const date = new Date(parsed.year, parsed.month - 1, 1, 12);
  return new Intl.DateTimeFormat(undefined, withYear ? { month: style, year: "numeric" } : { month: style }).format(date);
}

/** "9 Sep" (always day first, like formatLongDate). */
export function formatDayMonth(iso: string): string {
  const date = dateFromIso(iso);
  if (!isValidDate(date)) return iso;
  const { day, month } = dayAndMonth(date, "short");
  return day && month ? `${day} ${month}` : iso;
}

/** "9–14 Sep", "28 Aug–2 Sep"; a single day gives "9 Sep". Ranges a year or more apart in the same month carry years. */
export function formatDayRange(start: string, end: string): string {
  const from = dateFromIso(start);
  const to = dateFromIso(end);
  if (!isValidDate(from) || !isValidDate(to)) return `${start}${EN_DASH}${end}`;
  if (start === end) return formatDayMonth(start);
  const sameMonth = from.getMonth() === to.getMonth();
  const sameYear = from.getFullYear() === to.getFullYear();
  if (sameMonth && sameYear) {
    const first = dayAndMonth(from, "short");
    const last = dayAndMonth(to, "short");
    if (first.day && last.day && last.month) return `${first.day}${EN_DASH}${last.day} ${last.month}`;
  }
  if (sameMonth && !sameYear) {
    return `${formatDayMonth(start)} ${from.getFullYear()}${EN_DASH}${formatDayMonth(end)} ${to.getFullYear()}`;
  }
  return `${formatDayMonth(start)}${EN_DASH}${formatDayMonth(end)}`;
}

/** "Today" | "Yesterday" | "Upcoming · 20 September 2026" | formatLongDate. */
export function relativeDayLabel(iso: string, today: string): string {
  if (!isValidDate(dateFromIso(iso)) || !isValidDate(dateFromIso(today))) return formatLongDate(iso);
  const diff = isoDayDiff(today, iso);
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  if (diff > 0) return `Upcoming · ${formatLongDate(iso)}`;
  return formatLongDate(iso);
}
