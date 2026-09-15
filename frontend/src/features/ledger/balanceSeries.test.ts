import { describe, expect, it } from "vitest";
import type { Plan, TransactionItem } from "@/features/ledger/types";
import { demoPlan } from "./demo-data";
import { getOpenBalanceTotals } from "./selectors";
import {
  downsample,
  getBalanceEvents,
  getBalanceMovers,
  getDailyNetSeries,
  getNetChange,
  hasBalanceHistory,
  personKeyOf,
} from "./balanceSeries";

const today = "2026-09-14";

function item(overrides: Partial<TransactionItem> & Pick<TransactionItem, "id">): TransactionItem {
  return {
    source: "personal",
    title: "Entry",
    eventDate: "2026-09-10",
    amountMinor: 10000,
    currency: "PKR",
    direction: "incoming",
    kind: "expense",
    counterparty: "Sara",
    status: "open",
    createdAt: "2026-09-10T10:00:00.000Z",
    ...overrides,
  };
}

function planWith(transactions: TransactionItem[], groups: Plan["groups"] = []): Pick<Plan, "groups" | "transactions"> {
  return { groups, transactions };
}

describe("getBalanceEvents", () => {
  it("turns the demo plan into signed events, oldest first, with the settlement reversal", () => {
    const events = getBalanceEvents(demoPlan, today);
    expect(events.map((event) => [event.date, event.deltaMinor])).toEqual([
      ["2026-09-05", 110000],
      ["2026-09-08", 1200000],
      ["2026-09-10", -1200000],
      ["2026-09-11", -240000],
      ["2026-09-13", -185000],
    ]);
    expect(events[0]).toMatchObject({ groupId: "flat-bills", currency: "PKR" });
    expect(events[1]).toMatchObject({ personKey: "ali|PKR", personName: "Ali" });
    expect(events[0]?.personKey).toBeUndefined();
  });

  it("signs payments the other way round from expenses and loans", () => {
    const events = getBalanceEvents(planWith([
      item({ id: "a", kind: "payment", direction: "incoming", source: "group", groupId: "g" }),
      item({ id: "b", kind: "payment", direction: "outgoing", source: "group", groupId: "g", eventDate: "2026-09-11" }),
      item({ id: "c", kind: "loan", direction: "outgoing", eventDate: "2026-09-12" }),
    ]), today);
    expect(events.map((event) => event.deltaMinor)).toEqual([-10000, 10000, -10000]);
  });

  it("clamps future dates to today and falls back to the event date when settledAt is missing or invalid", () => {
    const events = getBalanceEvents(planWith([
      item({ id: "future", eventDate: "2026-09-20" }),
      item({ id: "settled", eventDate: "2026-09-09", status: "settled" }),
      item({ id: "bad", eventDate: "2026-09-08", status: "settled", settledAt: "not a date" }),
    ]), today);
    expect(events.map((event) => [event.date, event.deltaMinor])).toEqual([
      ["2026-09-08", 10000],
      ["2026-09-08", -10000],
      ["2026-09-09", 10000],
      ["2026-09-09", -10000],
      [today, 10000],
    ]);
  });

  it("keys people by trimmed, lower-cased name per currency and skips zero or unreadable entries", () => {
    expect(personKeyOf("  Ali Khan ", "PKR")).toBe("ali khan|PKR");
    const events = getBalanceEvents(planWith([
      item({ id: "zero", amountMinor: 0 }),
      item({ id: "nan", amountMinor: Number.NaN }),
      item({ id: "date", eventDate: "", createdAt: "" }),
      item({ id: "blank", counterparty: "   " }),
    ]), today);
    expect(events).toEqual([{ date: "2026-09-10", currency: "PKR", deltaMinor: 10000, personKey: "|PKR", personName: "Someone" }]);
  });
});

describe("getDailyNetSeries", () => {
  it("ends on the current figure and walks back day by day", () => {
    const events = getBalanceEvents(demoPlan, today);
    const series = getDailyNetSeries(events, -315000, today, 7);
    // Each value is the end-of-day balance: 8 Sep loan, 10 Sep settled, 11 Sep dinner, 13 Sep coffee.
    expect(series).toEqual([1310000, 1310000, 110000, -130000, -130000, -315000, -315000]);
    expect(series).toHaveLength(7);
    expect(series.at(-1)).toBe(-315000);
  });

  it("is flat when nothing happened and never returns NaN", () => {
    expect(getDailyNetSeries([], 0, today, 5)).toEqual([0, 0, 0, 0, 0]);
    expect(getDailyNetSeries([], Number.NaN, today, 3)).toEqual([0, 0, 0]);
    expect(getDailyNetSeries([], 500, today, 0)).toEqual([500]);
  });

  it("walks back across a month end", () => {
    const events = [{ date: "2026-09-01", currency: "PKR", deltaMinor: 300 }, { date: "2026-08-31", currency: "PKR", deltaMinor: 200 }];
    expect(getDailyNetSeries(events, 1000, "2026-09-02", 4)).toEqual([500, 700, 1000, 1000]);
  });
});

describe("getNetChange", () => {
  it("matches the demo expectations: net −315000, change −425000 over 7 days", () => {
    const [pkr] = getOpenBalanceTotals(demoPlan);
    expect(pkr ? pkr.owedMinor - pkr.oweMinor : null).toBe(-315000);
    expect(getNetChange(demoPlan, "PKR", { today, days: 7 })).toEqual({ changeMinor: -425000, eventCount: 4 });
  });

  it("includes day one of the window and ignores other currencies", () => {
    expect(getNetChange(demoPlan, "PKR", { today, days: 10 })).toEqual({ changeMinor: -315000, eventCount: 5 });
    expect(getNetChange(demoPlan, "PKR", { today, days: 1 })).toEqual({ changeMinor: 0, eventCount: 0 });
    expect(getNetChange(demoPlan, "USD", { today, days: 30 })).toEqual({ changeMinor: 0, eventCount: 0 });
  });

  it("knows whether a currency has any history", () => {
    expect(hasBalanceHistory(demoPlan, "PKR")).toBe(true);
    expect(hasBalanceHistory(demoPlan, "USD")).toBe(false);
  });
});

describe("downsample", () => {
  it("keeps every second day of 31 and both ends", () => {
    const values = Array.from({ length: 31 }, (_, index) => index);
    expect(downsample(values, 16)).toEqual(Array.from({ length: 16 }, (_, index) => index * 2));
    expect(downsample([1, 2, 3], 16)).toEqual([1, 2, 3]);
  });
});

describe("getBalanceMovers", () => {
  it("ranks the demo movers: Ali, then Weekend crew, then Flat bills", () => {
    const movers = getBalanceMovers(demoPlan, { today });
    expect(movers.map((mover) => [mover.name, mover.kind, mover.eventCount])).toEqual([
      ["Ali", "person", 3],
      ["Weekend crew", "group", 1],
      ["Flat bills", "group", 1],
    ]);
    const [ali, weekend, flat] = movers;
    expect(ali).toMatchObject({ key: "person:ali|PKR", balanceMinor: -185000, changeMinor: -185000, lastEventDate: "2026-09-13" });
    expect(ali?.id).toBeUndefined();
    expect(weekend).toMatchObject({ id: "weekend-crew", accent: "#6657E8", balanceMinor: -240000, changeMinor: -240000 });
    expect(flat).toMatchObject({ id: "flat-bills", balanceMinor: 110000, changeMinor: 110000, lastEventDate: "2026-09-05" });
  });

  it("anchors each 16-point series to the current balance and keeps the loan spike", () => {
    const [ali, weekend, flat] = getBalanceMovers(demoPlan, { today });
    for (const mover of [ali, weekend, flat]) {
      expect(mover?.series).toHaveLength(16);
      expect(mover?.series.at(-1)).toBe(mover?.balanceMinor);
      expect(mover?.series.every(Number.isFinite)).toBe(true);
    }
    expect(Math.max(...(ali?.series ?? []))).toBe(1200000);
    expect(flat?.series[0]).toBe(0);
  });

  it("returns nothing for an empty plan and honours the limit", () => {
    expect(getBalanceMovers(planWith([]), { today })).toEqual([]);
    const groups: Plan["groups"] = ["A", "B", "C", "D", "E"].map((name) => ({
      id: name.toLowerCase(), name, currency: "PKR", accent: "#6657E8", members: [], balanceMinor: 0, role: "member",
    }));
    const movers = getBalanceMovers(planWith([], groups), { today });
    expect(movers.map((mover) => mover.name)).toEqual(["A", "B", "C", "D"]);
    expect(movers[0]).toMatchObject({ changeMinor: 0, eventCount: 0, series: new Array(16).fill(0) });
    expect(movers[0]?.lastEventDate).toBeUndefined();
    expect(getBalanceMovers(planWith([], groups), { today, limit: 2 })).toHaveLength(2);
  });

  it("drops settled friends with no recent activity but keeps open balances, and breaks ties by latest event then name", () => {
    const movers = getBalanceMovers(planWith([
      item({ id: "old", counterparty: "Omar", eventDate: "2026-06-01", status: "settled", settledAt: "2026-06-02T10:00:00.000Z" }),
      item({ id: "open-old", counterparty: "Zara", eventDate: "2026-06-01", direction: "outgoing" }),
      item({ id: "recent-b", counterparty: "Bilal", eventDate: "2026-09-12" }),
      item({ id: "recent-a", counterparty: "Ayesha", eventDate: "2026-09-12" }),
      item({ id: "earlier", counterparty: "Danish", eventDate: "2026-09-01" }),
    ]), { today });
    expect(movers.map((mover) => mover.name)).toEqual(["Ayesha", "Bilal", "Danish", "Zara"]);
    expect(movers.at(-1)).toMatchObject({ balanceMinor: -10000, changeMinor: 0, eventCount: 0, lastEventDate: "2026-06-01" });
  });
});
