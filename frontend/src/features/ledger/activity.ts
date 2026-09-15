// Pure Activity selectors (§3.6). No react-native imports: Vitest runs this file, so runtime imports stay relative (D21).
// Dates are local calendar strings ("YYYY-MM-DD"), compared as strings and stepped on noon dates, so DST never moves a day.
import type { Plan, TransactionDirection, TransactionItem, TransactionKind, TransactionStatus } from "@/features/ledger/types";
import {
  addDaysIso,
  formatDayMonth,
  formatDayRange,
  formatLongDate,
  formatMonth,
  formatWeekday,
  lastDayOfMonth,
  shiftMonth,
} from "../../lib/format";
import { getOpenBalanceTotals } from "./selectors";

export type ActivityPeriod = "week" | "month" | "year" | "all";

export type ActivityQuery = {
  /** The panel switch: drives the headline, chart and categories. */
  side: TransactionDirection;
  /** "both" (default) lists both sides; "side" is a filter chosen in the sheet and lists only `side` (D11). */
  listSides: "both" | "side";
  period: ActivityPeriod;
  scope: "all" | "personal" | string;
  kind: "all" | TransactionKind;
  status: "all" | TransactionStatus;
  /** Resolved chart currency (never mixed). */
  currency: string;
  today: string;
};

export type Bucket = { start: string; end: string; label: string; selectedLabel: string; a11yLabel: string };

export type Category = { key: "personal" | string; name: string; accent?: string; valueMinor: number; count: number };

const RIGHT_QUOTE = "’";

// ---------------------------------------------------------------------------
// Windows and filters
// ---------------------------------------------------------------------------

/** Lower bound of the date window (inclusive). Week and month end on today; year starts on the 1st, 11 months back. */
export function periodStart(period: ActivityPeriod, today: string): string | null {
  if (period === "week") return addDaysIso(today, -6);
  if (period === "month") return addDaysIso(today, -29);
  if (period === "year") return `${shiftMonth(today.slice(0, 7), -11)}-01`;
  return null;
}

/** "last 7 days" | "last 30 days" | "last 12 months" | "all time". */
export function periodPhrase(period: ActivityPeriod): string {
  if (period === "week") return "last 7 days";
  if (period === "month") return "last 30 days";
  if (period === "year") return "last 12 months";
  return "all time";
}

function matchesScope(item: TransactionItem, scope: string): boolean {
  if (scope === "all") return true;
  if (scope === "personal") return item.source === "personal";
  return item.source === "group" && item.groupId === scope;
}

/** Scope, kind, status (group rows have no status, so they drop out when one is chosen) and the lower-bound date filter. */
function matchesCommon(item: TransactionItem, q: ActivityQuery, start: string | null, ignoreScope = false): boolean {
  if (!ignoreScope && !matchesScope(item, q.scope)) return false;
  if (q.kind !== "all" && item.kind !== q.kind) return false;
  if (q.status !== "all" && item.status !== q.status) return false;
  if (start !== null && item.eventDate < start) return false;
  return true;
}

function matchesListSide(item: TransactionItem, q: ActivityQuery): boolean {
  return q.listSides === "both" || item.direction === q.side;
}

/** History list: every common filter, plus the side when the sheet picked one. Keeps API order. */
export function filterList(plan: Plan, q: ActivityQuery): TransactionItem[] {
  const start = periodStart(q.period, q.today);
  return plan.transactions.filter((item) => matchesCommon(item, q, start) && matchesListSide(item, q));
}

/** Chart items: common filters, the panel side and one currency. Payments only chart when Type is Payment. */
export function chartItems(plan: Plan, q: ActivityQuery, ignoreScope = false): TransactionItem[] {
  const start = periodStart(q.period, q.today);
  return plan.transactions.filter(
    (item) =>
      matchesCommon(item, q, start, ignoreScope) &&
      item.direction === q.side &&
      item.currency === q.currency &&
      (item.kind !== "payment" || q.kind === "payment"),
  );
}

/** Entries that match every filter and the list side but fall before the window. 0 for "all". */
export function olderEntryCount(plan: Plan, q: ActivityQuery): number {
  const start = periodStart(q.period, q.today);
  if (start === null) return 0;
  return plan.transactions.filter((item) => matchesCommon(item, q, null) && matchesListSide(item, q) && item.eventDate < start).length;
}

/** Source, type, status and a chosen list side. Period and the panel side are always visible, so they never count. */
export function activeFilterCount(q: ActivityQuery): number {
  return Number(q.scope !== "all") + Number(q.kind !== "all") + Number(q.status !== "all") + Number(q.listSides === "side");
}

/** Filters that change what the chart can draw (a chosen list side does not). */
export function chartFilterCount(q: ActivityQuery): number {
  return Number(q.scope !== "all") + Number(q.kind !== "all") + Number(q.status !== "all");
}

// ---------------------------------------------------------------------------
// Currency and headline
// ---------------------------------------------------------------------------

function isGroupScope(scope: string): boolean {
  return scope !== "all" && scope !== "personal";
}

function safeAmount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/** Sorted unique currencies across open totals, transactions and groups. */
export function listCurrencies(plan: Plan): string[] {
  const set = new Set<string>();
  for (const row of getOpenBalanceTotals(plan)) set.add(row.currency);
  for (const item of plan.transactions) set.add(item.currency);
  for (const group of plan.groups) set.add(group.currency);
  return Array.from(set).filter(Boolean).sort((left, right) => left.localeCompare(right));
}

/** Current open balance on one side (ignores period, kind and status). */
export function getSideBalance(plan: Plan, side: TransactionDirection, currency: string, scope: string): number {
  if (scope === "all") {
    const row = getOpenBalanceTotals(plan).find((total) => total.currency === currency);
    if (!row) return 0;
    return safeAmount(side === "incoming" ? row.owedMinor : row.oweMinor);
  }
  if (scope === "personal") {
    return plan.transactions
      .filter((item) => item.source === "personal" && item.status !== "settled" && item.direction === side && item.currency === currency)
      .reduce((sum, item) => sum + safeAmount(item.amountMinor), 0);
  }
  const group = plan.groups.find((candidate) => candidate.id === scope);
  if (!group || !Number.isFinite(group.balanceMinor)) return 0;
  return side === "incoming" ? Math.max(0, group.balanceMinor) : Math.max(0, -group.balanceMinor);
}

/**
 * The group's currency when scoped to a group; else the preferred currency if listed; else the largest side balance;
 * else the currency with the most transactions; else the first group's currency, or PKR.
 */
export function resolveCurrency(plan: Plan, o: { scope: string; side: TransactionDirection; preferred: string | null }): string {
  if (isGroupScope(o.scope)) {
    const group = plan.groups.find((candidate) => candidate.id === o.scope);
    if (group) return group.currency;
  }
  const currencies = listCurrencies(plan);
  if (o.preferred && currencies.includes(o.preferred)) return o.preferred;

  const balanceScope = isGroupScope(o.scope) ? "all" : o.scope;
  let best: string | null = null;
  let bestBalance = 0;
  for (const currency of currencies) {
    const balance = getSideBalance(plan, o.side, currency, balanceScope);
    if (balance > bestBalance) {
      best = currency;
      bestBalance = balance;
    }
  }
  if (best) return best;

  const counts = new Map<string, number>();
  for (const item of plan.transactions) counts.set(item.currency, (counts.get(item.currency) ?? 0) + 1);
  let busiest: string | null = null;
  let busiestCount = 0;
  for (const currency of currencies) {
    const count = counts.get(currency) ?? 0;
    if (count > busiestCount) {
      busiest = currency;
      busiestCount = count;
    }
  }
  if (busiest) return busiest;

  return plan.groups[0]?.currency ?? "PKR";
}

/** Another currency with chart items in this window and side (for "Switch to USD above"), or null. */
export function otherCurrencyWithData(plan: Plan, q: ActivityQuery): string | null {
  for (const currency of listCurrencies(plan)) {
    if (currency === q.currency) continue;
    if (chartItems(plan, { ...q, currency }).length > 0) return currency;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Buckets and series
// ---------------------------------------------------------------------------

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function ymIndex(ym: string): number {
  return Number(ym.slice(0, 4)) * 12 + (Number(ym.slice(5, 7)) - 1);
}

/** "9 September" (formatLongDate without the year). */
function dayMonthLong(iso: string): string {
  return formatLongDate(iso).replace(/\s+\d{4}$/, "");
}

function monthBucket(ym: string, currentYm: string, style: "narrow" | "short"): Bucket {
  const otherYear = ym.slice(0, 4) !== currentYm.slice(0, 4);
  return {
    start: `${ym}-01`,
    end: `${ym}-${pad2(lastDayOfMonth(ym))}`,
    label: formatMonth(ym, style),
    selectedLabel: `${formatMonth(ym, "short")}${otherYear ? ` ${RIGHT_QUOTE}${ym.slice(2, 4)}` : ""}`,
    a11yLabel: formatMonth(ym, "long", true),
  };
}

function quarterBucket(index: number): Bucket {
  const year = Math.floor(index / 4);
  const quarter = index - year * 4;
  const startYm = `${year}-${pad2(quarter * 3 + 1)}`;
  const endYm = `${year}-${pad2(quarter * 3 + 3)}`;
  return {
    start: `${startYm}-01`,
    end: `${endYm}-${pad2(lastDayOfMonth(endYm))}`,
    label: `Q${quarter + 1}`,
    selectedLabel: `Q${quarter + 1} ${year}`,
    a11yLabel: `${formatMonth(startYm, "long")} to ${formatMonth(endYm, "long")} ${year}`,
  };
}

function yearBucket(year: number): Bucket {
  const label = String(year);
  return { start: `${year}-01-01`, end: `${year}-12-31`, label, selectedLabel: label, a11yLabel: label };
}

/** Earliest eventDate across every transaction (unfiltered, so the axis never jumps with the side), clamped to today. */
function earliestDate(plan: Plan, today: string): string {
  let first = today;
  for (const item of plan.transactions) if (item.eventDate && item.eventDate < first) first = item.eventDate;
  return first;
}

export function buildBuckets(plan: Plan, period: ActivityPeriod, today: string): Bucket[] {
  const currentYm = today.slice(0, 7);

  if (period === "week") {
    return Array.from({ length: 7 }, (_, index) => {
      const day = addDaysIso(today, index - 6);
      const short = formatWeekday(day, "short");
      return {
        start: day,
        end: day,
        label: short,
        selectedLabel: index === 6 ? "Today" : short,
        a11yLabel: `${index === 6 ? "Today, " : ""}${formatWeekday(day, "long")} ${dayMonthLong(day)}`,
      };
    });
  }

  if (period === "month") {
    const start = addDaysIso(today, -29);
    return Array.from({ length: 5 }, (_, index) => {
      const from = addDaysIso(start, 6 * index);
      const to = addDaysIso(start, 6 * index + 5);
      return {
        start: from,
        end: to,
        label: formatDayMonth(from),
        selectedLabel: formatDayRange(from, to),
        a11yLabel: `${dayMonthLong(from)} to ${dayMonthLong(to)}`,
      };
    });
  }

  if (period === "year") {
    return Array.from({ length: 12 }, (_, index) => monthBucket(shiftMonth(currentYm, index - 11), currentYm, "narrow"));
  }

  const firstYm = earliestDate(plan, today).slice(0, 7);
  const span = ymIndex(currentYm) - ymIndex(firstYm) + 1;

  if (span <= 12) {
    const count = Math.max(span, 6);
    const style = count <= 7 ? "short" : "narrow";
    return Array.from({ length: count }, (_, index) => monthBucket(shiftMonth(currentYm, index - (count - 1)), currentYm, style));
  }

  if (span <= 36) {
    const toQuarter = (ym: string) => Number(ym.slice(0, 4)) * 4 + Math.floor((Number(ym.slice(5, 7)) - 1) / 3);
    const first = toQuarter(firstYm);
    const last = toQuarter(currentYm);
    return Array.from({ length: last - first + 1 }, (_, index) => quarterBucket(first + index));
  }

  const lastYear = Number(currentYm.slice(0, 4));
  const count = Math.max(lastYear - Number(firstYm.slice(0, 4)) + 1, 4);
  return Array.from({ length: count }, (_, index) => yearBucket(lastYear - (count - 1) + index));
}

/** Sums items into buckets by `min(eventDate, today)`. Peak ties go to the later bucket; a zero total has no peak. */
export function bucketSeries(
  items: TransactionItem[],
  buckets: Bucket[],
  today: string,
): { values: number[]; totalMinor: number; peakIndex: number | null } {
  const values = buckets.map(() => 0);
  for (const item of items) {
    const date = item.eventDate > today ? today : item.eventDate;
    const index = buckets.findIndex((bucket) => bucket.start <= date && date <= bucket.end);
    if (index < 0) continue;
    values[index] = (values[index] ?? 0) + safeAmount(item.amountMinor);
  }
  const totalMinor = values.reduce((sum, value) => sum + value, 0);
  if (totalMinor <= 0) return { values, totalMinor, peakIndex: null };
  let peakIndex = 0;
  values.forEach((value, index) => {
    if (value >= (values[peakIndex] ?? 0)) peakIndex = index;
  });
  return { values, totalMinor, peakIndex };
}

// ---------------------------------------------------------------------------
// Categories and history
// ---------------------------------------------------------------------------

function sourceKey(item: TransactionItem): string {
  return item.source === "personal" ? "personal" : item.groupId ?? "group";
}

function sourceCategory(plan: Plan, key: string, fallbackName?: string): Category {
  if (key === "personal") return { key, name: "Personal", valueMinor: 0, count: 0 };
  const group = plan.groups.find((candidate) => candidate.id === key);
  const name = group?.name ?? fallbackName?.trim() ?? "Group";
  return group ? { key, name: name || "Group", accent: group.accent, valueMinor: 0, count: 0 } : { key, name: name || "Group", valueMinor: 0, count: 0 };
}

function byValueThenName(left: Category, right: Category): number {
  return right.valueMinor - left.valueMinor || left.name.localeCompare(right.name);
}

/** Sources (personal and each group) from the chart items, ignoring scope. Keeps values above 0 plus the selected scope. */
export function buildCategories(plan: Plan, q: ActivityQuery): Category[] {
  const map = new Map<string, Category>();
  for (const item of chartItems(plan, q, true)) {
    const key = sourceKey(item);
    const category = map.get(key) ?? sourceCategory(plan, key, item.groupName);
    category.valueMinor += safeAmount(item.amountMinor);
    category.count += 1;
    map.set(key, category);
  }
  const kept = Array.from(map.values()).filter((category) => category.valueMinor > 0 || category.key === q.scope);
  if (q.scope !== "all" && !kept.some((category) => category.key === q.scope)) kept.push(sourceCategory(plan, q.scope));
  return kept.sort(byValueThenName);
}

/**
 * Zero-value cards for when nothing charts: sources with any entry on this side in this currency (any date or status),
 * else Personal plus every group. The selected scope is always included. Personal comes first, then groups in plan order.
 */
export function fallbackCategories(plan: Plan, q: ActivityQuery): Category[] {
  const keys = new Set<string>();
  const names = new Map<string, string | undefined>();
  for (const item of plan.transactions) {
    if (item.direction !== q.side || item.currency !== q.currency) continue;
    if (item.kind === "payment" && q.kind !== "payment") continue;
    const key = sourceKey(item);
    keys.add(key);
    if (!names.has(key)) names.set(key, item.groupName);
  }
  if (keys.size === 0) {
    keys.add("personal");
    for (const group of plan.groups) keys.add(group.id);
  }
  if (q.scope !== "all") keys.add(q.scope);
  const order = (key: string) => {
    if (key === "personal") return -1;
    const index = plan.groups.findIndex((group) => group.id === key);
    return index < 0 ? plan.groups.length : index;
  };
  return Array.from(keys)
    .sort((left, right) => order(left) - order(right))
    .map((key) => sourceCategory(plan, key, names.get(key)));
}

/** Day sections, newest first; items keep their order inside a day. */
export function groupByDay(items: TransactionItem[]): { date: string; items: TransactionItem[] }[] {
  const grouped = new Map<string, TransactionItem[]>();
  for (const item of items) {
    const list = grouped.get(item.eventDate);
    if (list) list.push(item);
    else grouped.set(item.eventDate, [item]);
  }
  return Array.from(grouped, ([date, dayItems]) => ({ date, items: dayItems })).sort((left, right) => right.date.localeCompare(left.date));
}
