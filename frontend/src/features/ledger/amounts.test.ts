import { describe, expect, it } from "vitest";
import type { TransactionItem } from "./types";
import { describeCustomPayment, isPartiallySettled, remainingAmountOf, settledAmountOf } from "./amounts";

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

describe("custom payment amounts", () => {
  it("waits quietly while the field is empty", () => {
    expect(describeCustomPayment("", 50000)).toEqual({ amountMinor: 0, valid: false, settlesInFull: false, leftMinor: 50000 });
    expect(describeCustomPayment("   ", 50000).error).toBeUndefined();
  });

  it("accepts a smaller amount and says what stays open", () => {
    expect(describeCustomPayment("200", 50000)).toEqual({ amountMinor: 20000, valid: true, settlesInFull: false, leftMinor: 30000 });
    expect(describeCustomPayment("1,000.50", 200000)).toMatchObject({ amountMinor: 100050, valid: true, leftMinor: 99950 });
  });

  it("treats the exact remainder as settling the entry", () => {
    expect(describeCustomPayment("500", 50000)).toEqual({ amountMinor: 50000, valid: true, settlesInFull: true, leftMinor: 0 });
  });

  it("rejects zero, negative, unreadable and too-large amounts with a reason", () => {
    expect(describeCustomPayment("0", 50000)).toMatchObject({ valid: false, error: "Enter an amount greater than zero.", leftMinor: 50000 });
    expect(describeCustomPayment("-5", 50000)).toMatchObject({ valid: false, error: "Enter an amount greater than zero." });
    expect(describeCustomPayment("abc", 50000)).toMatchObject({ valid: false, error: "Enter an amount greater than zero." });
    expect(describeCustomPayment("500.01", 50000)).toMatchObject({ valid: false, error: "That is more than what is still open.", leftMinor: 50000 });
  });
});
