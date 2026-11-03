import { describe, expect, it } from "vitest";
import type { TransactionItem } from "./types";
import { isPartiallySettled, remainingAmountOf, settledAmountOf } from "./amounts";

function item(overrides: Partial<TransactionItem> = {}): TransactionItem {
  return {
    id: "entry",
    source: "personal",
    title: "Coffee money",
    eventDate: "2026-09-13",
    amountMinor: 200000,
    currency: "PKR",
    direction: "outgoing",
    kind: "expense",
    status: "open",
    createdAt: "2026-09-13T08:20:00.000Z",
    ...overrides,
  };
}

describe("partial settlement amounts", () => {
  it("shows what is left after a partial payment", () => {
    const half = item({ settledAmountMinor: 100000 });
    expect(settledAmountOf(half)).toBe(100000);
    expect(remainingAmountOf(half)).toBe(100000);
    expect(isPartiallySettled(half)).toBe(true);
  });

  it("treats an untouched open entry as fully outstanding", () => {
    const open = item();
    expect(settledAmountOf(open)).toBe(0);
    expect(remainingAmountOf(open)).toBe(200000);
    expect(isPartiallySettled(open)).toBe(false);
  });

  it("treats settled history as fully paid even without a stored paid figure", () => {
    const settled = item({ status: "settled", settledAt: "2026-09-14T10:00:00.000Z" });
    expect(settledAmountOf(settled)).toBe(200000);
    expect(remainingAmountOf(settled)).toBe(0);
    expect(isPartiallySettled(settled)).toBe(false);
  });

  it("never lets a bad paid figure exceed the entry or go below zero", () => {
    expect(remainingAmountOf(item({ settledAmountMinor: 400000 }))).toBe(0);
    expect(remainingAmountOf(item({ settledAmountMinor: -500 }))).toBe(200000);
    expect(remainingAmountOf(item({ settledAmountMinor: Number.NaN }))).toBe(200000);
  });
});
