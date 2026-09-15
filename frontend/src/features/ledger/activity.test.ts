import { describe, expect, it } from "vitest";
import type { Plan, TransactionItem } from "@/features/ledger/types";
import { addDaysIso, isoDayDiff } from "../../lib/format";
import {
  activeFilterCount,
  bucketSeries,
  buildBuckets,
  buildCategories,
  chartFilterCount,
  chartItems,
  fallbackCategories,
  filterList,
  getSideBalance,
  groupByDay,
  listCurrencies,
  olderEntryCount,
  otherCurrencyWithData,
  periodPhrase,
  periodStart,
  resolveCurrency,
  type ActivityQuery,
} from "./activity";
import { demoPlan } from "./demo-data";

const TODAY = "2026-09-14";

function tx(overrides: Partial<TransactionItem> & Pick<TransactionItem, "id">): TransactionItem {
  return {
    source: "personal",
    title: "Entry",
    eventDate: TODAY,
    amountMinor: 10000,
    currency: "PKR",
    direction: "incoming",
    kind: "expense",
    status: "open",
    createdAt: `${TODAY}T09:00:00.000Z`,
    ...overrides,
  };
}

function plan(transactions: TransactionItem[], extra: Partial<Plan> = {}): Plan {
  return {
    user: { id: "user-1", name: "Anna", email: "anna@example.com" },
    totals: [],
    groups: [],
    reviews: [],
    claims: [],
    activity: [],
    transactions,
    ...extra,
  };
}

function query(overrides: Partial<ActivityQuery> = {}): ActivityQuery {
  return { side: "incoming", listSides: "both", period: "month", scope: "all", kind: "all", status: "all", currency: "PKR", today: TODAY, ...overrides };
}

const crew = { id: "crew", name: "Weekend crew", currency: "PKR", accent: "#6657E8", members: [], balanceMinor: -240000, role: "owner" as const };
const flat = { id: "flat", name: "Flat bills", currency: "PKR", accent: "#E88B3D", members: [], balanceMinor: 110000, role: "member" as const };
const trip = { id: "trip", name: "Dubai trip", currency: "USD", accent: "#16A77E", members: [], balanceMinor: 5000, role: "member" as const };

describe("periodStart and periodPhrase", () => {
  it("gives inclusive lower bounds ending on today", () => {
    expect(periodStart("week", TODAY)).toBe("2026-09-08");
    expect(periodStart("month", TODAY)).toBe("2026-08-16");
    expect(periodStart("year", TODAY)).toBe("2025-10-01");
    expect(periodStart("all", TODAY)).toBeNull();
    expect(periodStart("year", "2026-01-31")).toBe("2025-02-01");
  });

  it("names each window", () => {
    expect([periodPhrase("week"), periodPhrase("month"), periodPhrase("year"), periodPhrase("all")]).toEqual([
      "last 7 days",
      "last 30 days",
      "last 12 months",
      "all time",
    ]);
  });
});

describe("buildBuckets", () => {
  it("week is 7 single days ending on today", () => {
    const buckets = buildBuckets(plan([]), "week", TODAY);
    expect(buckets).toHaveLength(7);
    expect(buckets[0]?.start).toBe("2026-09-08");
    expect(buckets[6]).toMatchObject({ start: TODAY, end: TODAY, selectedLabel: "Today" });
    for (const bucket of buckets) expect(bucket.start).toBe(bucket.end);
  });

  it("month is exactly 5 contiguous 6-day buckets ending on today", () => {
    const buckets = buildBuckets(plan([]), "month", TODAY);
    expect(buckets).toHaveLength(5);
    expect(buckets[0]?.start).toBe(periodStart("month", TODAY));
    expect(buckets[4]?.end).toBe(TODAY);
    buckets.forEach((bucket, index) => {
      expect(isoDayDiff(bucket.start, bucket.end)).toBe(5);
      const next = buckets[index + 1];
      if (next) expect(next.start).toBe(addDaysIso(bucket.end, 1));
    });
    expect(buckets[4]?.a11yLabel).toContain(" to ");
  });

  it("year is 12 calendar months with real month ends", () => {
    const buckets = buildBuckets(plan([]), "year", TODAY);
    expect(buckets).toHaveLength(12);
    expect(buckets[0]).toMatchObject({ start: "2025-10-01", end: "2025-10-31" });
    expect(buckets[4]).toMatchObject({ start: "2026-02-01", end: "2026-02-28" });
    expect(buckets[11]).toMatchObject({ start: "2026-09-01", end: "2026-09-30" });
    expect(buckets[0]?.selectedLabel).toContain("’25");
    expect(buckets[11]?.selectedLabel).not.toContain("’");
    expect(buckets[0]?.a11yLabel).toContain("2025");
  });

  it("all pads to 6 months, stays monthly up to 12 and switches to quarters at 13", () => {
    const empty = buildBuckets(plan([]), "all", TODAY);
    expect(empty).toHaveLength(6);
    expect(empty[0]?.start).toBe("2026-04-01");
    expect(empty[5]?.end).toBe("2026-09-30");

    const twelve = buildBuckets(plan([tx({ id: "a", eventDate: "2025-10-01" })]), "all", TODAY);
    expect(twelve).toHaveLength(12);
    expect(twelve[0]?.start).toBe("2025-10-01");

    const thirteen = buildBuckets(plan([tx({ id: "a", eventDate: "2025-09-30" })]), "all", TODAY);
    expect(thirteen).toHaveLength(5);
    expect(thirteen[0]).toMatchObject({ start: "2025-07-01", end: "2025-09-30", label: "Q3", selectedLabel: "Q3 2025" });
    expect(thirteen[4]).toMatchObject({ start: "2026-07-01", end: "2026-09-30", label: "Q3" });
  });

  it("all uses years past 36 months, at least 4", () => {
    const quarters = buildBuckets(plan([tx({ id: "a", eventDate: "2023-10-01" })]), "all", TODAY);
    expect(quarters[0]?.label).toBe("Q4");
    const years = buildBuckets(plan([tx({ id: "a", eventDate: "2023-08-20" })]), "all", TODAY);
    expect(years.map((bucket) => bucket.label)).toEqual(["2023", "2024", "2025", "2026"]);
    const long = buildBuckets(plan([tx({ id: "a", eventDate: "2019-02-02" })]), "all", TODAY);
    expect(long).toHaveLength(8);
    expect(long[0]).toMatchObject({ start: "2019-01-01", end: "2019-12-31" });
  });

  it("all ignores future-only history when finding the first month", () => {
    const buckets = buildBuckets(plan([tx({ id: "a", eventDate: "2027-03-01" })]), "all", TODAY);
    expect(buckets).toHaveLength(6);
    expect(buckets[5]?.end).toBe("2026-09-30");
  });
});

describe("bucketSeries", () => {
  it("clamps future dates into today's bucket and totals the window", () => {
    const buckets = buildBuckets(plan([]), "week", TODAY);
    const items = [tx({ id: "a", eventDate: "2026-09-20", amountMinor: 500 }), tx({ id: "b", eventDate: "2026-09-08", amountMinor: 200 })];
    const series = bucketSeries(items, buckets, TODAY);
    expect(series.values).toEqual([200, 0, 0, 0, 0, 0, 500]);
    expect(series.totalMinor).toBe(700);
    expect(series.peakIndex).toBe(6);
  });

  it("gives peak ties to the later bucket and no peak for a zero total", () => {
    const buckets = buildBuckets(plan([]), "week", TODAY);
    const tied = bucketSeries([tx({ id: "a", eventDate: "2026-09-09", amountMinor: 300 }), tx({ id: "b", eventDate: "2026-09-12", amountMinor: 300 })], buckets, TODAY);
    expect(tied.peakIndex).toBe(4);
    const none = bucketSeries([], buckets, TODAY);
    expect(none).toEqual({ values: [0, 0, 0, 0, 0, 0, 0], totalMinor: 0, peakIndex: null });
  });

  it("skips items outside every bucket", () => {
    const buckets = buildBuckets(plan([]), "week", TODAY);
    expect(bucketSeries([tx({ id: "a", eventDate: "2026-01-01" })], buckets, TODAY).totalMinor).toBe(0);
  });
});

describe("filters", () => {
  const items = [
    tx({ id: "old", eventDate: "2026-07-01" }),
    tx({ id: "future", eventDate: "2026-10-20", direction: "outgoing" }),
    tx({ id: "settled", status: "settled", settledAt: "2026-09-12T00:00:00Z" }),
    tx({ id: "group", source: "group", groupId: "crew", groupName: "Weekend crew", status: undefined, direction: "outgoing" }),
    tx({ id: "pay", source: "group", groupId: "flat", groupName: "Flat bills", kind: "payment", status: undefined }),
    tx({ id: "usd", currency: "USD", amountMinor: 900 }),
  ];
  const data = plan(items, { groups: [crew, flat] });

  it("keeps the lower-bound-only date filter (future entries stay listed)", () => {
    const ids = filterList(data, query()).map((item) => item.id);
    expect(ids).toEqual(["future", "settled", "group", "pay", "usd"]);
    expect(filterList(data, query({ period: "all" }))).toHaveLength(6);
  });

  it("drops group rows when a status is chosen", () => {
    expect(filterList(data, query({ status: "open", period: "all" })).map((item) => item.id)).toEqual(["old", "future", "usd"]);
    expect(filterList(data, query({ status: "settled" })).map((item) => item.id)).toEqual(["settled"]);
  });

  it("lists both sides by default and one side only when the sheet picked it", () => {
    expect(filterList(data, query({ side: "outgoing" }))).toHaveLength(5);
    expect(filterList(data, query({ side: "outgoing", listSides: "side" })).map((item) => item.id)).toEqual(["future", "group"]);
  });

  it("filters by source scope", () => {
    expect(filterList(data, query({ scope: "personal" })).map((item) => item.id)).toEqual(["future", "settled", "usd"]);
    expect(filterList(data, query({ scope: "crew" })).map((item) => item.id)).toEqual(["group"]);
  });

  it("excludes payments from the chart unless Type is Payment, and never mixes currencies", () => {
    expect(chartItems(data, query()).map((item) => item.id)).toEqual(["settled"]);
    expect(chartItems(data, query({ kind: "payment" })).map((item) => item.id)).toEqual(["pay"]);
    expect(chartItems(data, query({ currency: "USD" })).map((item) => item.id)).toEqual(["usd"]);
    expect(chartItems(data, query({ scope: "crew" }), true).map((item) => item.id)).toEqual(["settled"]);
  });

  it("counts older entries that match every filter", () => {
    expect(olderEntryCount(data, query())).toBe(1);
    expect(olderEntryCount(data, query({ side: "outgoing", listSides: "side" }))).toBe(0);
    expect(olderEntryCount(data, query({ period: "all" }))).toBe(0);
  });

  it("counts active filters: source, type, status and a chosen list side", () => {
    expect(activeFilterCount(query())).toBe(0);
    expect(activeFilterCount(query({ period: "week", side: "outgoing" }))).toBe(0);
    expect(activeFilterCount(query({ scope: "crew", kind: "loan", status: "open", listSides: "side" }))).toBe(4);
    expect(chartFilterCount(query({ listSides: "side" }))).toBe(0);
    expect(chartFilterCount(query({ scope: "personal", kind: "loan" }))).toBe(2);
  });
});

describe("currency and headline", () => {
  it("lists unique currencies from totals, transactions and groups", () => {
    const data = plan([tx({ id: "a", currency: "USD" })], { totals: [{ currency: "PKR", oweMinor: 0, owedMinor: 0 }], groups: [trip, crew] });
    expect(listCurrencies(data)).toEqual(["PKR", "USD"]);
    expect(listCurrencies(plan([]))).toEqual([]);
  });

  it("uses net totals plus open personal entries for scope all", () => {
    expect(getSideBalance(demoPlan, "outgoing", "PKR", "all")).toBe(425000);
    expect(getSideBalance(demoPlan, "incoming", "PKR", "all")).toBe(110000);
    expect(getSideBalance(demoPlan, "incoming", "USD", "all")).toBe(0);
  });

  it("uses open personal entries for the personal scope", () => {
    expect(getSideBalance(demoPlan, "outgoing", "PKR", "personal")).toBe(185000);
    expect(getSideBalance(demoPlan, "incoming", "PKR", "personal")).toBe(0);
  });

  it("uses the group's balanceMinor for a group scope", () => {
    expect(getSideBalance(demoPlan, "outgoing", "PKR", "weekend-crew")).toBe(240000);
    expect(getSideBalance(demoPlan, "incoming", "PKR", "weekend-crew")).toBe(0);
    expect(getSideBalance(demoPlan, "incoming", "PKR", "flat-bills")).toBe(110000);
    expect(getSideBalance(demoPlan, "incoming", "PKR", "missing")).toBe(0);
  });

  it("resolves the chart currency in order", () => {
    const data = plan(
      [tx({ id: "a", currency: "USD", amountMinor: 100 }), tx({ id: "b", currency: "USD" }), tx({ id: "c", currency: "AED", status: "settled" })],
      { groups: [trip, crew], totals: [{ currency: "PKR", oweMinor: 0, owedMinor: 50000 }] },
    );
    expect(resolveCurrency(data, { scope: "trip", side: "incoming", preferred: "PKR" })).toBe("USD");
    expect(resolveCurrency(data, { scope: "all", side: "incoming", preferred: "AED" })).toBe("AED");
    expect(resolveCurrency(data, { scope: "all", side: "incoming", preferred: null })).toBe("PKR");
    expect(resolveCurrency(data, { scope: "all", side: "incoming", preferred: "EUR" })).toBe("PKR");
    expect(resolveCurrency(data, { scope: "all", side: "outgoing", preferred: null })).toBe("USD");
    expect(resolveCurrency(plan([], { groups: [trip] }), { scope: "all", side: "incoming", preferred: null })).toBe("USD");
    expect(resolveCurrency(plan([]), { scope: "all", side: "incoming", preferred: null })).toBe("PKR");
  });

  it("finds another currency with chart data in the window", () => {
    const data = plan([tx({ id: "a", currency: "USD" }), tx({ id: "b", currency: "PKR", direction: "outgoing" })]);
    expect(otherCurrencyWithData(data, query())).toBe("USD");
    expect(otherCurrencyWithData(data, query({ currency: "USD" }))).toBeNull();
  });
});

describe("categories and days", () => {
  const items = [
    tx({ id: "p1", amountMinor: 3000 }),
    tx({ id: "p2", amountMinor: 2000, eventDate: "2026-09-10" }),
    tx({ id: "g1", source: "group", groupId: "flat", groupName: "Flat bills", status: undefined, amountMinor: 9000 }),
    tx({ id: "g2", source: "group", groupId: "crew", groupName: "Weekend crew", status: undefined, amountMinor: 0 }),
    tx({ id: "old", source: "group", groupId: "crew", groupName: "Weekend crew", status: undefined, eventDate: "2025-01-01" }),
  ];
  const data = plan(items, { groups: [crew, flat] });

  it("groups chart items by source, sorted by value, and matches the caption total", () => {
    const categories = buildCategories(data, query());
    expect(categories).toEqual([
      { key: "flat", name: "Flat bills", accent: "#E88B3D", valueMinor: 9000, count: 1 },
      { key: "personal", name: "Personal", valueMinor: 5000, count: 2 },
    ]);
    const total = bucketSeries(chartItems(data, query()), buildBuckets(data, "month", TODAY), TODAY).totalMinor;
    expect(categories.reduce((sum, category) => sum + category.valueMinor, 0)).toBe(total);
  });

  it("ignores scope for values and always keeps the selected scope", () => {
    const scoped = buildCategories(data, query({ scope: "crew" }));
    expect(scoped.map((category) => category.key)).toEqual(["flat", "personal", "crew"]);
    expect(scoped[2]).toMatchObject({ name: "Weekend crew", valueMinor: 0 });
    expect(buildCategories(data, query({ side: "outgoing" }))).toEqual([]);
  });

  it("builds zero-value fallback cards", () => {
    expect(fallbackCategories(data, query()).map((category) => category.key)).toEqual(["personal", "crew", "flat"]);
    expect(fallbackCategories(plan([], { groups: [crew] }), query()).map((category) => category.key)).toEqual(["personal", "crew"]);
    expect(fallbackCategories(plan([]), query())).toEqual([{ key: "personal", name: "Personal", valueMinor: 0, count: 0 }]);
    expect(fallbackCategories(plan([tx({ id: "a", direction: "outgoing" })]), query({ side: "outgoing" })).every((category) => category.valueMinor === 0)).toBe(true);
  });

  it("groups by day, newest first, keeping order inside a day", () => {
    const days = groupByDay([tx({ id: "a", eventDate: "2026-09-10" }), tx({ id: "b" }), tx({ id: "c", eventDate: "2026-09-10" })]);
    expect(days.map((day) => [day.date, day.items.map((item) => item.id)])).toEqual([
      [TODAY, ["b"]],
      ["2026-09-10", ["a", "c"]],
    ]);
    expect(groupByDay([])).toEqual([]);
  });
});
