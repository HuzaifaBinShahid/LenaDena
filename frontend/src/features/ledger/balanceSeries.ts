// Pure balance history for the Plan tab: 7-day change on the balance card and the Top movers grid (§3.3).
// No react-native imports: Vitest runs this file, so runtime imports stay relative (D21).
import type { Plan, TransactionItem } from "@/features/ledger/types";
import { addDaysIso, dateToIso } from "../../lib/format";

/** One change to a balance on one day. Positive means friends owe you more (or you owe less). */
export type BalanceEvent = { date: string; currency: string; deltaMinor: number; groupId?: string; personKey?: string; personName?: string };

export type BalanceMover = {
  key: string;
  kind: "group" | "person";
  id?: string;
  name: string;
  accent?: string;
  currency: string;
  balanceMinor: number;
  changeMinor: number;
  eventCount: number;
  lastEventDate?: string;
  series: number[];
};

const ISO_DAY = /^(\d{4}-\d{2}-\d{2})/;
const SERIES_POINTS = 16;

function isoDay(value: string | undefined): string | null {
  if (!value) return null;
  const match = ISO_DAY.exec(value.trim());
  return match?.[1] ?? null;
}

function finiteMinor(value: number) {
  return Number.isFinite(value) ? Math.abs(value) : 0;
}

/** Expense or loan: incoming +, outgoing −. Payment: incoming − (they paid you back), outgoing + (you paid yours). */
function signOf(item: Pick<TransactionItem, "kind" | "direction">): 1 | -1 {
  const incoming = item.direction === "incoming";
  if (item.kind === "payment") return incoming ? -1 : 1;
  return incoming ? 1 : -1;
}

/** `counterparty.trim().toLowerCase() + "|" + currency`. */
export function personKeyOf(counterparty: string | undefined, currency: string): string {
  return `${(counterparty ?? "").trim().toLowerCase()}|${currency}`;
}

function settledDay(item: TransactionItem): string | null {
  if (item.settledAt) {
    const settled = new Date(item.settledAt);
    if (!Number.isNaN(settled.getTime())) return dateToIso(settled);
  }
  return null;
}

/**
 * Every balance change in the plan, oldest first. A settled personal item adds the opposite event on the day it was
 * settled (falling back to its event date). Future dates are clamped to `today`.
 */
export function getBalanceEvents(plan: Pick<Plan, "transactions">, today: string): BalanceEvent[] {
  const events: BalanceEvent[] = [];
  const clamp = (day: string) => (day > today ? today : day);
  for (const item of plan.transactions) {
    const amount = finiteMinor(item.amountMinor);
    const day = isoDay(item.eventDate) ?? isoDay(item.createdAt);
    if (!amount || !day) continue;
    const delta = signOf(item) * amount;
    const base: Omit<BalanceEvent, "date" | "deltaMinor"> = { currency: item.currency };
    if (item.source === "group" && item.groupId) base.groupId = item.groupId;
    if (item.source === "personal") {
      base.personKey = personKeyOf(item.counterparty, item.currency);
      base.personName = item.counterparty?.trim() || "Someone";
    }
    events.push({ ...base, date: clamp(day), deltaMinor: delta });
    if (item.source === "personal" && item.status === "settled") {
      events.push({ ...base, date: clamp(settledDay(item) ?? day), deltaMinor: -delta });
    }
  }
  return events.sort((left, right) => (left.date < right.date ? -1 : left.date > right.date ? 1 : 0));
}

/**
 * `days` daily values ending today, oldest first. The last value is `currentMinor` (the authoritative figure) and the
 * series walks back one day at a time by subtracting that day's changes. Pass events already filtered to one balance.
 */
export function getDailyNetSeries(events: readonly BalanceEvent[], currentMinor: number, today: string, days: number): number[] {
  const count = Number.isFinite(days) ? Math.max(1, Math.floor(days)) : 1;
  const start = addDaysIso(today, -(count - 1));
  const byDay = new Map<string, number>();
  for (const event of events) {
    if (event.date < start || event.date > today || !Number.isFinite(event.deltaMinor)) continue;
    byDay.set(event.date, (byDay.get(event.date) ?? 0) + event.deltaMinor);
  }
  const values = new Array<number>(count);
  values[count - 1] = Number.isFinite(currentMinor) ? currentMinor : 0;
  let day = today;
  for (let index = count - 1; index > 0; index--) {
    values[index - 1] = (values[index] ?? 0) - (byDay.get(day) ?? 0);
    day = addDaysIso(day, -1);
  }
  return values;
}

function windowStart(today: string, days: number) {
  const count = Number.isFinite(days) ? Math.max(1, Math.floor(days)) : 1;
  return addDaysIso(today, -(count - 1));
}

/** Net change for one currency over the last `days` days (today included) and how many events made it. */
export function getNetChange(plan: Pick<Plan, "transactions">, currency: string, o: { today: string; days: number }): { changeMinor: number; eventCount: number } {
  const start = windowStart(o.today, o.days);
  let changeMinor = 0;
  let eventCount = 0;
  for (const event of getBalanceEvents(plan, o.today)) {
    if (event.currency !== currency || event.date < start) continue;
    changeMinor += event.deltaMinor;
    eventCount += 1;
  }
  return { changeMinor, eventCount };
}

/** True when the plan has any balance history in `currency` (so a zero change means "no change", not "nothing tracked"). */
export function hasBalanceHistory(plan: Pick<Plan, "transactions">, currency: string): boolean {
  return plan.transactions.some((item) => item.currency === currency && finiteMinor(item.amountMinor) > 0);
}

/** Evenly picks `count` values, always keeping the first and the last. 31 daily points become every second day. */
export function downsample(values: readonly number[], count: number): number[] {
  if (values.length <= count || count < 2) return values.slice();
  const last = values.length - 1;
  return Array.from({ length: count }, (_, index) => values[Math.round((index * last) / (count - 1))] ?? 0);
}

type Candidate = Omit<BalanceMover, "series" | "changeMinor" | "eventCount" | "lastEventDate"> & { events: BalanceEvent[] };

/**
 * The most active balances: every group (valued at `balanceMinor`) and every person with an open personal balance or
 * recent activity (valued at their open personal net). Ranked by events in the window, then the latest event, then name.
 */
export function getBalanceMovers(plan: Pick<Plan, "groups" | "transactions">, o: { today: string; days?: number; limit?: number }): BalanceMover[] {
  const days = o.days ?? 30;
  const limit = o.limit ?? 4;
  const start = windowStart(o.today, days);
  const events = getBalanceEvents(plan, o.today);
  const candidates: Candidate[] = [];

  const groupIds = new Set<string>();
  for (const group of plan.groups) {
    if (groupIds.has(group.id)) continue;
    groupIds.add(group.id);
    candidates.push({
      key: `group:${group.id}`,
      kind: "group",
      id: group.id,
      name: group.name,
      accent: group.accent,
      currency: group.currency,
      balanceMinor: Number.isFinite(group.balanceMinor) ? group.balanceMinor : 0,
      events: events.filter((event) => event.groupId === group.id),
    });
  }

  const people = new Map<string, Candidate>();
  for (const item of plan.transactions) {
    if (item.source !== "personal") continue;
    const personKey = personKeyOf(item.counterparty, item.currency);
    let person = people.get(personKey);
    if (!person) {
      person = {
        key: `person:${personKey}`,
        kind: "person",
        name: item.counterparty?.trim() || "Someone",
        currency: item.currency,
        balanceMinor: 0,
        events: events.filter((event) => event.personKey === personKey),
      };
      people.set(personKey, person);
    }
    if (item.status !== "settled") person.balanceMinor += signOf(item) * finiteMinor(item.amountMinor);
  }

  const movers: BalanceMover[] = [];
  for (const candidate of [...candidates, ...people.values()]) {
    const recent = candidate.events.filter((event) => event.date >= start);
    if (candidate.kind === "person" && candidate.balanceMinor === 0 && recent.length === 0) continue;
    const { events: own, ...rest } = candidate;
    const lastEventDate = own[own.length - 1]?.date;
    const mover: BalanceMover = {
      ...rest,
      changeMinor: recent.reduce((sum, event) => sum + event.deltaMinor, 0),
      eventCount: recent.length,
      series: downsample(getDailyNetSeries(own, candidate.balanceMinor, o.today, days + 1), SERIES_POINTS),
    };
    if (lastEventDate) mover.lastEventDate = lastEventDate;
    movers.push(mover);
  }

  return movers
    .sort((left, right) => {
      if (left.eventCount !== right.eventCount) return right.eventCount - left.eventCount;
      const leftDate = left.lastEventDate ?? "";
      const rightDate = right.lastEventDate ?? "";
      if (leftDate !== rightDate) return leftDate < rightDate ? 1 : -1;
      const byName = left.name.localeCompare(right.name);
      return byName !== 0 ? byName : left.key.localeCompare(right.key);
    })
    .slice(0, Math.max(0, limit));
}
