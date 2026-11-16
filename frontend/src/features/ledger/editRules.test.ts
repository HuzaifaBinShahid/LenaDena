import { describe, expect, it } from "vitest";
import {
  allocationsFromShares,
  canChange,
  deleteEntryWarning,
  deleteExpenseWarning,
  expenseBlockedText,
  minorToInput,
  personalAmountError,
  personalLocks,
  receiptChange,
  receiptDraft,
  shownReceipt,
  withNewReceipt,
  withoutReceipt,
} from "./editRules";
import { calculateShares } from "./split";
import { toMinorUnits } from "../../lib/format";

describe("canChange", () => {
  it("is true when the server says the person may edit or delete", () => {
    expect(canChange({ canEdit: true })).toBe(true);
    expect(canChange({ canDelete: true })).toBe(true);
    expect(canChange({ canEdit: false, canDelete: true })).toBe(true);
  });

  it("is false for payments and for a server that does not know about editing yet", () => {
    expect(canChange({})).toBe(false);
    expect(canChange({ canEdit: false, canDelete: false })).toBe(false);
  });
});

describe("personalLocks", () => {
  it("locks nothing while nothing is paid", () => {
    expect(personalLocks({ amountMinor: 50000, status: "open" })).toEqual({ paidMinor: 0, amountLocked: false, sideLocked: false, minAmountMinor: 1 });
  });

  it("locks who owes whom once anything is paid, and keeps the amount above it", () => {
    expect(personalLocks({ amountMinor: 50000, settledAmountMinor: 20000, status: "open" })).toEqual({ paidMinor: 20000, amountLocked: false, sideLocked: true, minAmountMinor: 20001 });
  });

  it("locks the amount of a fully paid balance", () => {
    expect(personalLocks({ amountMinor: 50000, settledAmountMinor: 50000, status: "settled" })).toEqual({ paidMinor: 50000, amountLocked: true, sideLocked: true, minAmountMinor: 50000 });
  });
});

describe("personalAmountError", () => {
  const open = personalLocks({ amountMinor: 50000, settledAmountMinor: 20000, status: "open" });

  it("asks for an amount above zero", () => {
    expect(personalAmountError(0, personalLocks({ amountMinor: 1, status: "open" }), "PKR")).toBe("Enter an amount greater than zero.");
  });

  it("says how much is already paid when the amount is too low, and accepts anything above it", () => {
    expect(personalAmountError(20000, open, "PKR")).toMatch(/must be more than the .*200.* already paid/);
    expect(personalAmountError(19999, open, "PKR")).toMatch(/already paid/);
    expect(personalAmountError(20001, open, "PKR")).toBeUndefined();
    expect(personalAmountError(900000, open, "PKR")).toBeUndefined();
  });

  it("holds a fully paid balance at its amount", () => {
    const settled = personalLocks({ amountMinor: 50000, settledAmountMinor: 50000, status: "settled" });
    expect(personalAmountError(50000, settled, "PKR")).toBeUndefined();
    expect(personalAmountError(60000, settled, "PKR")).toBe("This balance is fully paid, so its amount can't change.");
  });
});

describe("the receipt photo", () => {
  const saved = "https://files.example/signed-receipt.jpg";

  it("keeps the saved photo by default: it is shown, and nothing is sent", () => {
    const draft = receiptDraft(saved);
    expect(shownReceipt(draft)).toBe(saved);
    expect(receiptChange(draft)).toBeUndefined();
  });

  it("replaces it with a new local photo, which is shown and sent for upload", () => {
    const draft = withNewReceipt(receiptDraft(saved), "file:///new.jpg");
    expect(shownReceipt(draft)).toBe("file:///new.jpg");
    expect(receiptChange(draft)).toBe("file:///new.jpg");
  });

  it("removes it: nothing is shown and null is sent", () => {
    const draft = withoutReceipt(receiptDraft(saved));
    expect(shownReceipt(draft)).toBeUndefined();
    expect(receiptChange(draft)).toBeNull();
  });

  it("removing a photo that was only just chosen leaves the saved one removed too", () => {
    const draft = withoutReceipt(withNewReceipt(receiptDraft(saved), "file:///new.jpg"));
    expect(shownReceipt(draft)).toBeUndefined();
    expect(receiptChange(draft)).toBeNull();
  });

  it("choosing again after removing brings a photo back", () => {
    const draft = withNewReceipt(withoutReceipt(receiptDraft(saved)), "file:///again.jpg");
    expect(shownReceipt(draft)).toBe("file:///again.jpg");
    expect(receiptChange(draft)).toBe("file:///again.jpg");
  });

  it("with no saved photo, removing sends nothing at all", () => {
    const draft = withoutReceipt(receiptDraft());
    expect(shownReceipt(draft)).toBeUndefined();
    expect(receiptChange(draft)).toBeUndefined();
    expect(receiptChange(withNewReceipt(receiptDraft(), "file:///first.jpg"))).toBe("file:///first.jpg");
  });
});

describe("filling the expense form from a saved expense", () => {
  it("writes amounts the way the field takes them", () => {
    expect(minorToInput(185000)).toBe("1850");
    expect(minorToInput(185050)).toBe("1850.5");
    expect(minorToInput(7)).toBe("0.07");
    expect(minorToInput(1)).toBe("0.01");
  });

  it("has nothing to fill for an equal split", () => {
    expect(allocationsFromShares("equal", [{ memberId: "a", amountMinor: 100 }])).toEqual({});
  });

  it("round-trips an exact split through the calculator the form uses", () => {
    const saved = [{ memberId: "a", amountMinor: 123456 }, { memberId: "b", amountMinor: 7 }, { memberId: "c", amountMinor: 50 }];
    const allocations = allocationsFromShares("exact", saved);
    expect(allocations).toEqual({ a: "1234.56", b: "0.07", c: "0.5" });
    expect(calculateShares(123513, ["a", "b", "c"], "exact", allocations)).toEqual(saved);
  });

  it("round-trips a percentage split", () => {
    const saved = [{ memberId: "a", amountMinor: 60000, percentageBasisPoints: 6000 }, { memberId: "b", amountMinor: 40000, percentageBasisPoints: 4000 }];
    const allocations = allocationsFromShares("percentage", saved);
    expect(allocations).toEqual({ a: "60", b: "40" });
    expect(calculateShares(100000, ["a", "b"], "percentage", allocations)).toEqual(saved);
    expect(allocationsFromShares("percentage", [{ memberId: "x", amountMinor: 1, percentageBasisPoints: 3333 }])).toEqual({ x: "33.33" });
  });

  it("keeps what was typed as a decimal string the form can parse back", () => {
    expect(toMinorUnits(minorToInput(1234567))).toBe(1234567);
  });
});

describe("words", () => {
  it("explains why an expense cannot be edited", () => {
    expect(expenseBlockedText("member_left")).toContain("left the group");
    expect(expenseBlockedText("member_left")).toContain("delete it and add it again");
    expect(expenseBlockedText("not_yours")).toContain("added or paid");
    expect(expenseBlockedText(undefined)).toContain("added or paid");
  });

  it("warns what deleting a balance removes, including recorded payments", () => {
    expect(deleteEntryWarning({ title: "Lunch", currency: "PKR", settledAmountMinor: 0 })).toBe('This removes "Lunch" from your balances. It can\'t be undone.');
    expect(deleteEntryWarning({ title: "Lunch", currency: "PKR" })).not.toContain("recorded as paid");
    expect(deleteEntryWarning({ title: "Lunch", currency: "PKR", settledAmountMinor: 20000 })).toMatch(/and the .*200.* recorded as paid on it/);
  });

  it("warns that deleting an expense changes everyone's balances", () => {
    const text = deleteExpenseWarning("Dinner", "Weekend crew");
    expect(text).toContain('"Dinner" for everyone in Weekend crew');
    expect(text).toContain("balances change");
    expect(text).toContain("can't be undone");
  });
});
