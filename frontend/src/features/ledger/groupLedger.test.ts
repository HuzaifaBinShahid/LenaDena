import { describe, expect, it } from "vitest";
import type { TransactionItem } from "@/features/ledger/types";
import { demoPlan } from "./demo-data";
import {
  defaultGroupExpenseView,
  getGroupTransactions,
  groupPosition,
  groupViewFilterCount,
  indexGroupTransactions,
  type GroupExpenseView,
} from "./groupLedger";

function row(overrides: Partial<TransactionItem>): TransactionItem {
  return {
    id: "row",
    source: "group",
    groupId: "g1",
    groupName: "Weekend crew",
    title: "Dinner",
    eventDate: "2026-09-10",
    amountMinor: 100000,
    currency: "PKR",
    direction: "outgoing",
    kind: "expense",
    createdAt: "2026-09-10T10:00:00.000Z",
    ...overrides,
  };
}

const view = (overrides: Partial<GroupExpenseView>): GroupExpenseView => ({ ...defaultGroupExpenseView, ...overrides });
const ids = (items: TransactionItem[]) => items.map((item) => item.id);

describe("indexGroupTransactions", () => {
  it("groups demo rows by group id and skips personal rows", () => {
    const index = indexGroupTransactions(demoPlan);
    expect([...index.keys()].sort()).toEqual(["flat-bills", "weekend-crew"]);
    expect(ids(index.get("weekend-crew") ?? [])).toEqual(["expense-1"]);
    expect(ids(index.get("flat-bills") ?? [])).toEqual(["expense-2"]);
  });

  it("skips group rows without a group id and keeps plan order", () => {
    const index = indexGroupTransactions({
      transactions: [
        row({ id: "a" }),
        row({ id: "orphan", groupId: undefined }),
        row({ id: "personal", source: "personal", groupId: "g1" }),
        row({ id: "b", groupId: "g2" }),
        row({ id: "c" }),
      ],
    });
    expect(ids(index.get("g1") ?? [])).toEqual(["a", "c"]);
    expect(ids(index.get("g2") ?? [])).toEqual(["b"]);
    expect(index.size).toBe(2);
  });

  it("returns an empty map for a brand-new account", () => {
    expect(indexGroupTransactions({ transactions: [] }).size).toBe(0);
  });
});

describe("getGroupTransactions", () => {
  const items = [
    row({ id: "old-big", eventDate: "2026-09-01", amountMinor: 900000 }),
    row({ id: "new-early", eventDate: "2026-09-12", createdAt: "2026-09-12T08:00:00.000Z", amountMinor: 50000 }),
    row({ id: "new-late", eventDate: "2026-09-12", createdAt: "2026-09-12T20:00:00.000Z", amountMinor: 50000, direction: "incoming" }),
    row({ id: "payment", eventDate: "2026-09-11", amountMinor: 200000, kind: "payment", direction: "incoming", status: "settled" }),
  ];

  it("sorts recent by event date, then created time, newest first", () => {
    expect(ids(getGroupTransactions(items, defaultGroupExpenseView))).toEqual(["new-late", "new-early", "payment", "old-big"]);
  });

  it("sorts largest by amount and breaks ties with the recent order", () => {
    expect(ids(getGroupTransactions(items, view({ sort: "largest" })))).toEqual(["old-big", "payment", "new-late", "new-early"]);
  });

  it("filters by side", () => {
    expect(ids(getGroupTransactions(items, view({ side: "incoming" })))).toEqual(["new-late", "payment"]);
    expect(ids(getGroupTransactions(items, view({ side: "outgoing" })))).toEqual(["new-early", "old-big"]);
  });

  it("filters by type, treating every non-payment row as an expense", () => {
    expect(ids(getGroupTransactions(items, view({ type: "payment" })))).toEqual(["payment"]);
    expect(ids(getGroupTransactions(items, view({ type: "expense" })))).toEqual(["new-late", "new-early", "old-big"]);
    expect(ids(getGroupTransactions([row({ id: "loan", kind: "loan" })], view({ type: "expense" })))).toEqual(["loan"]);
  });

  it("combines side and type filters and can match nothing", () => {
    expect(ids(getGroupTransactions(items, view({ side: "outgoing", type: "payment" })))).toEqual([]);
  });

  it("never mutates the input array", () => {
    const copy = [...items];
    getGroupTransactions(items, view({ sort: "largest" }));
    expect(items).toEqual(copy);
  });

  it("handles an empty list and non-finite amounts", () => {
    expect(getGroupTransactions([], defaultGroupExpenseView)).toEqual([]);
    const broken = [row({ id: "nan", amountMinor: Number.NaN }), row({ id: "ok", amountMinor: 10 })];
    expect(ids(getGroupTransactions(broken, view({ sort: "largest" })))).toEqual(["ok", "nan"]);
  });
});

describe("groupPosition", () => {
  it("is owed to you above zero", () => {
    expect(groupPosition({ balanceMinor: 110000 }, true)).toEqual({ tone: "owed", label: "Owed to you", icon: "arrow-down" });
  });

  it("is you owe below zero", () => {
    expect(groupPosition({ balanceMinor: -240000 }, true)).toEqual({ tone: "owe", label: "You owe", icon: "arrow-up" });
  });

  it("is all square at zero with activity", () => {
    expect(groupPosition({ balanceMinor: 0 }, true)).toEqual({ tone: "square", label: "All square", icon: "check" });
  });

  it("is no balance yet at zero without activity (never owed to you)", () => {
    expect(groupPosition({ balanceMinor: 0 }, false)).toEqual({ tone: "new", label: "No balance yet", icon: "sparkles" });
    expect(groupPosition({ balanceMinor: Number.NaN }, false).tone).toBe("new");
  });
});

describe("groupViewFilterCount", () => {
  it("counts side and type filters but not the sort order", () => {
    expect(groupViewFilterCount(defaultGroupExpenseView)).toBe(0);
    expect(groupViewFilterCount(view({ sort: "largest" }))).toBe(0);
    expect(groupViewFilterCount(view({ side: "incoming" }))).toBe(1);
    expect(groupViewFilterCount(view({ side: "outgoing", type: "payment" }))).toBe(2);
  });

  it("keeps the default view frozen", () => {
    expect(Object.isFrozen(defaultGroupExpenseView)).toBe(true);
  });
});
