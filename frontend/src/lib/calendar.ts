/**
 * Pure calendar maths for the in-app date picker.
 *
 * Every date here is a local calendar day held at local noon (the same convention as `dateFromIso` in
 * `lib/format`), so a daylight-saving jump can never push a day across midnight, and nothing ever goes
 * through UTC. Months are 0-based like `Date#getMonth()`.
 */

export type YearMonth = { year: number; month: number };

export type CalendarCell = {
  date: Date;
  /** False for the leading and trailing days that belong to the previous or next month. */
  inMonth: boolean;
};

/** Monday. Weekdays follow `Date#getDay()`: 0 is Sunday. */
export const WEEK_STARTS_ON = 1;

/** A new local-noon date. Out-of-range days and months roll over like `new Date(y, m, d)`. */
export function localDay(year: number, month: number, day: number): Date {
  return new Date(year, month, day, 12, 0, 0, 0);
}

/** The same calendar day as `date`, at local noon. */
export function toLocalDay(date: Date): Date {
  return localDay(date.getFullYear(), date.getMonth(), date.getDate());
}

export function isValidDay(date: Date | null | undefined): date is Date {
  return date instanceof Date && !Number.isNaN(date.getTime());
}

/** -1, 0 or 1 comparing calendar days only (time of day is ignored). */
export function compareDays(a: Date, b: Date): number {
  const ay = a.getFullYear();
  const by = b.getFullYear();
  if (ay !== by) return ay < by ? -1 : 1;
  const am = a.getMonth();
  const bm = b.getMonth();
  if (am !== bm) return am < bm ? -1 : 1;
  const ad = a.getDate();
  const bd = b.getDate();
  if (ad !== bd) return ad < bd ? -1 : 1;
  return 0;
}

export function isSameDay(a: Date | null | undefined, b: Date | null | undefined): boolean {
  if (!isValidDay(a) || !isValidDay(b)) return false;
  return compareDays(a, b) === 0;
}

/** Whole days after `date` (negative for before), at local noon. */
export function addDays(date: Date, days: number): Date {
  return localDay(date.getFullYear(), date.getMonth(), date.getDate() + Math.trunc(days));
}

export function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one.
  return new Date(year, month + 1, 0, 12).getDate();
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function monthOf(date: Date): YearMonth {
  return { year: date.getFullYear(), month: date.getMonth() };
}

/** Shifts a month by whole months, rolling the year both ways. */
export function addMonths(value: YearMonth, months: number): YearMonth {
  const index = value.year * 12 + value.month + Math.trunc(months);
  const year = Math.floor(index / 12);
  return { year, month: index - year * 12 };
}

export function compareMonths(a: YearMonth, b: YearMonth): number {
  const left = a.year * 12 + a.month;
  const right = b.year * 12 + b.month;
  return left === right ? 0 : left < right ? -1 : 1;
}

export function isSameMonth(a: YearMonth, b: YearMonth): boolean {
  return compareMonths(a, b) === 0;
}

/** The same day of the month `months` away, clamped to that month's length (31 Jan + 1 month = 28/29 Feb). */
export function addMonthsToDate(date: Date, months: number): Date {
  const target = addMonths(monthOf(date), months);
  return localDay(target.year, target.month, Math.min(date.getDate(), daysInMonth(target.year, target.month)));
}

export type DateBounds = { minimumDate?: Date | undefined; maximumDate?: Date | undefined };

/** True when the day falls before `minimumDate` or after `maximumDate` (both inclusive bounds, compared by day). */
export function isDayDisabled(date: Date, { minimumDate, maximumDate }: DateBounds): boolean {
  if (isValidDay(minimumDate) && compareDays(date, minimumDate) < 0) return true;
  if (isValidDay(maximumDate) && compareDays(date, maximumDate) > 0) return true;
  return false;
}

/** The nearest allowed day, at local noon. An invalid date falls back to `fallback` (today by default). */
export function clampDay(date: Date, bounds: DateBounds, fallback: Date = new Date()): Date {
  const day = toLocalDay(isValidDay(date) ? date : fallback);
  const { minimumDate, maximumDate } = bounds;
  if (isValidDay(minimumDate) && compareDays(day, minimumDate) < 0) return toLocalDay(minimumDate);
  if (isValidDay(maximumDate) && compareDays(day, maximumDate) > 0) return toLocalDay(maximumDate);
  return day;
}

/** True when no day of the month is allowed. */
export function isMonthDisabled(value: YearMonth, { minimumDate, maximumDate }: DateBounds): boolean {
  if (isValidDay(minimumDate) && compareMonths(value, monthOf(minimumDate)) < 0) return true;
  if (isValidDay(maximumDate) && compareMonths(value, monthOf(maximumDate)) > 0) return true;
  return false;
}

/** The nearest month that has at least one allowed day. */
export function clampMonth(value: YearMonth, { minimumDate, maximumDate }: DateBounds): YearMonth {
  if (isValidDay(minimumDate) && compareMonths(value, monthOf(minimumDate)) < 0) return monthOf(minimumDate);
  if (isValidDay(maximumDate) && compareMonths(value, monthOf(maximumDate)) > 0) return monthOf(maximumDate);
  return value;
}

/** Whether paging `step` months (usually -1 or 1) from `value` lands on a month with an allowed day. */
export function canShiftMonth(value: YearMonth, step: number, bounds: DateBounds): boolean {
  return !isMonthDisabled(addMonths(value, step), bounds);
}

/** Whether `year` has at least one allowed day. */
export function isYearDisabled(year: number, { minimumDate, maximumDate }: DateBounds): boolean {
  if (isValidDay(minimumDate) && year < minimumDate.getFullYear()) return true;
  if (isValidDay(maximumDate) && year > maximumDate.getFullYear()) return true;
  return false;
}

/** Column (0-6) of a date's weekday in a week that starts on `weekStartsOn`. */
export function weekdayColumn(date: Date, weekStartsOn: number = WEEK_STARTS_ON): number {
  return (date.getDay() - weekStartsOn + 7) % 7;
}

/**
 * Always six full weeks (42 cells) so the grid never changes height between months. The first row starts on
 * `weekStartsOn` and holds the 1st of the month; the rest is padded with neighbouring months' days.
 */
export function monthMatrix(value: YearMonth, weekStartsOn: number = WEEK_STARTS_ON): CalendarCell[][] {
  const lead = weekdayColumn(localDay(value.year, value.month, 1), weekStartsOn);
  const rows: CalendarCell[][] = [];
  for (let row = 0; row < 6; row += 1) {
    const cells: CalendarCell[] = [];
    for (let column = 0; column < 7; column += 1) {
      const date = localDay(value.year, value.month, 1 - lead + row * 7 + column);
      cells.push({ date, inMonth: date.getMonth() === value.month && date.getFullYear() === value.year });
    }
    rows.push(cells);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Labels. `locale` is optional so the device locale applies in the app and tests can pin one.
// ---------------------------------------------------------------------------

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return parts.find((item) => item.type === type)?.value ?? "";
}

/** Weekday names in grid order, e.g. ["Mon", "Tue", …] (short) or ["Monday", …] (long). */
export function weekdayLabels(style: "short" | "long" | "narrow" = "short", locale?: string, weekStartsOn: number = WEEK_STARTS_ON): string[] {
  const formatter = new Intl.DateTimeFormat(locale, { weekday: style });
  // 5 January 2026 is a Monday; step from the Sunday before it.
  return Array.from({ length: 7 }, (_, index) => formatter.format(localDay(2026, 0, 4 + ((weekStartsOn + index) % 7))));
}

/** Month names January…December (long) or Jan…Dec (short). */
export function monthLabels(style: "short" | "long" = "long", locale?: string): string[] {
  const formatter = new Intl.DateTimeFormat(locale, { month: style });
  return Array.from({ length: 12 }, (_, month) => formatter.format(localDay(2026, month, 1)));
}

/** "October 2026". */
export function formatMonthTitle(value: YearMonth, locale?: string): string {
  const parts = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).formatToParts(localDay(value.year, value.month, 1));
  const month = part(parts, "month");
  const year = part(parts, "year");
  return month && year ? `${month} ${year}` : `${value.month + 1}/${value.year}`;
}

/** The picker header: `{ year: "2026", label: "Sat, 3 Oct" }`. */
export function formatHeaderDate(date: Date, locale?: string): { year: string; label: string } {
  const parts = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", year: "numeric" }).formatToParts(date);
  const weekday = part(parts, "weekday");
  const day = part(parts, "day");
  const month = part(parts, "month").replace(/\.$/, "");
  return { year: part(parts, "year") || String(date.getFullYear()), label: `${weekday}, ${day} ${month}` };
}

/** "Saturday 3 October 2026", the spoken form of a day. */
export function formatSpokenDate(date: Date, locale?: string): string {
  const parts = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).formatToParts(date);
  return `${part(parts, "weekday")} ${part(parts, "day")} ${part(parts, "month")} ${part(parts, "year")}`;
}

/** Screen-reader label for a day cell: "Saturday 3 October 2026, selected, today". */
export function dayAccessibilityLabel(date: Date, state: { selected?: boolean; today?: boolean; disabled?: boolean }, locale?: string): string {
  const notes = [state.selected ? "selected" : null, state.today ? "today" : null, state.disabled ? "not available" : null].filter(Boolean);
  return [formatSpokenDate(date, locale), ...notes].join(", ");
}

export type QuickDate = { key: "yesterday" | "today" | "tomorrow"; label: string; date: Date };

/** "Yesterday", "Today" and "Tomorrow", keeping only the ones inside the bounds. */
export function quickDates(today: Date, bounds: DateBounds): QuickDate[] {
  const base = toLocalDay(today);
  const all: QuickDate[] = [
    { key: "yesterday", label: "Yesterday", date: addDays(base, -1) },
    { key: "today", label: "Today", date: base },
    { key: "tomorrow", label: "Tomorrow", date: addDays(base, 1) },
  ];
  return all.filter((item) => !isDayDisabled(item.date, bounds));
}
