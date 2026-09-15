import { describe, expect, it } from "vitest";
import type { TransactionItem } from "@/features/ledger/types";
import { formatLongDate, formatMoney, formatShortDate } from "../../lib/format";
import { describeTransaction } from "./rowCopy";

const today = "2026-09-14";
const activity = { context: "activity" as const, today };
const group = { context: "group" as const, today };

function item(overrides: Partial<TransactionItem>): TransactionItem {
  return {
    id: "row",
    source: "personal",
    title: "Coffee money",
    eventDate: "2026-09-13",
    amountMinor: 185000,
    currency: "PKR",
    direction: "outgoing",
    kind: "expense",
    createdAt: "2026-09-13T08:20:00.000Z",
    ...overrides,
  };
}

const rs = (minor: number) => formatMoney(minor, "PKR");

describe("describeTransaction: personal rows", () => {
  it("personal incoming loan, open", () => {
    const row = describeTransaction(
      item({ title: "Camera loan", kind: "loan", direction: "incoming", counterparty: "Ali", status: "open", amountMinor: 1200000, eventDate: "2026-09-08" }),
      activity,
    );
    expect(row.title).toBe("Camera loan");
    expect(row.subtitle).toBe("Ali owes you · Personal");
    expect(row.amount).toEqual({ text: `+${rs(1200000)}`, tone: "positive" });
    expect(row.status).toEqual({ label: "Open", tone: "warning" });
    expect(row.tile).toEqual({ icon: "cash", tone: "lavender", badge: "in" });
    expect(row.canSettle).toBe(true);
    expect(row.upcoming).toBe(false);
    expect(row.accessibilityLabel).toBe(`Camera loan. Ali owes you. ${rs(1200000)}, owed to you. Open. ${formatLongDate("2026-09-08")}.`);
  });

  it("personal outgoing expense, settled", () => {
    const row = describeTransaction(item({ counterparty: "Ali", status: "settled", settledAt: "2026-09-13T10:00:00.000Z" }), activity);
    expect(row.subtitle).toBe("You owe Ali · Personal");
    expect(row.amount).toEqual({ text: `−${rs(185000)}`, tone: "negative" });
    expect(row.amount.text.startsWith("−")).toBe(true);
    expect(row.status).toEqual({ label: "Settled", tone: "positive" });
    expect(row.tile).toEqual({ icon: "file-text", tone: "violet", badge: "out" });
    expect(row.canSettle).toBe(false);
    expect(row.accessibilityLabel).toBe(`Coffee money. You owe Ali. ${rs(185000)}, you owe. Settled. ${formatLongDate("2026-09-13")}.`);
    expect(row.accessibilityLabel).not.toContain("−");
  });

  it("falls back to neutral phrases when a personal row has no counterparty", () => {
    expect(describeTransaction(item({ direction: "incoming", status: "open" }), activity).subtitle).toBe("Owed to you · Personal");
    expect(describeTransaction(item({ status: "open" }), activity).subtitle).toBe("You owe · Personal");
  });
});

describe("describeTransaction: group expense rows", () => {
  it("group expense incoming", () => {
    const row = describeTransaction(
      item({ source: "group", groupId: "flat-bills", groupName: "Flat bills", title: "September internet", direction: "incoming", amountMinor: 110000, eventDate: "2026-09-05" }),
      activity,
    );
    expect(row.subtitle).toBe("Owed back to you · Flat bills");
    expect(row.amount).toEqual({ text: `+${rs(110000)}`, tone: "positive" });
    expect(row.status).toEqual({ label: "Owed to you", tone: "positive" });
    expect(row.tile).toEqual({ icon: "file-text", tone: "violet", badge: "in" });
    expect(row.canSettle).toBe(false);
    expect(row.accessibilityLabel).toBe(`September internet. Owed back to you. ${rs(110000)}, owed to you. Owed to you. ${formatLongDate("2026-09-05")}.`);
  });

  it("group expense outgoing, with and without a counterparty", () => {
    const base = { source: "group" as const, groupId: "weekend-crew", groupName: "Weekend crew", title: "Dinner at Monal", amountMinor: 240000, eventDate: "2026-09-11" };
    const withPayer = describeTransaction(item({ ...base, counterparty: "Sara" }), activity);
    expect(withPayer.subtitle).toBe("You owe Sara · Weekend crew");
    expect(withPayer.amount).toEqual({ text: `−${rs(240000)}`, tone: "negative" });
    expect(withPayer.status).toEqual({ label: "You owe", tone: "danger" });
    expect(withPayer.tile).toEqual({ icon: "file-text", tone: "violet", badge: "out" });
    expect(withPayer.canSettle).toBe(false);

    const share = describeTransaction(item({ ...base, groupName: undefined }), activity);
    expect(share.subtitle).toBe("Your share · Group");
  });

  it("uses date first in the group context", () => {
    const row = describeTransaction(item({ source: "group", groupId: "weekend-crew", groupName: "Weekend crew", counterparty: "Sara", eventDate: "2026-09-11" }), group);
    expect(row.subtitle).toBe(`${formatShortDate("2026-09-11")} · You owe Sara`);
  });
});

describe("describeTransaction: payment rows", () => {
  it("payment incoming", () => {
    const row = describeTransaction(
      item({ source: "group", groupId: "flat-bills", groupName: "Flat bills", title: "Payment completed", kind: "payment", direction: "incoming", counterparty: "Hamza", amountMinor: 110000 }),
      activity,
    );
    expect(row.subtitle).toBe("Hamza paid you · Flat bills");
    expect(row.amount).toEqual({ text: rs(110000), tone: "neutral" });
    expect(row.status).toEqual({ label: "Paid", tone: "positive" });
    expect(row.tile).toEqual({ icon: "check-circle", tone: "mint" });
    expect(row.tile.badge).toBeUndefined();
    expect(row.accessibilityLabel).toBe(`Payment completed. Hamza paid you. ${rs(110000)}, paid. Paid. ${formatLongDate("2026-09-13")}.`);
  });

  it("payment outgoing", () => {
    const row = describeTransaction(
      item({ source: "group", groupId: "weekend-crew", groupName: "Weekend crew", title: "Payment completed", kind: "payment", direction: "outgoing", counterparty: "Sara", amountMinor: 240000 }),
      group,
    );
    expect(row.subtitle).toBe(`${formatShortDate("2026-09-13")} · You paid Sara`);
    expect(row.amount).toEqual({ text: rs(240000), tone: "neutral" });
    expect(row.amount.text).not.toMatch(/^[+−-]/);
    expect(row.status).toEqual({ label: "Paid", tone: "positive" });
    expect(row.tile).toEqual({ icon: "send", tone: "mint" });
    expect(row.canSettle).toBe(false);
  });

  it("passes the claimant fallback title through unchanged", () => {
    const row = describeTransaction(
      item({ source: "group", groupId: "weekend-crew", groupName: "Weekend crew", title: "Payment marked settled by payer", kind: "payment", direction: "outgoing", counterparty: "Sara" }),
      activity,
    );
    expect(row.title).toBe("Payment marked settled by payer");
    expect(row.subtitle).toBe("You paid Sara · Weekend crew");
    expect(row.accessibilityLabel.startsWith("Payment marked settled by payer. You paid Sara. ")).toBe(true);
  });

  it("uses neutral phrases for payments without a counterparty", () => {
    expect(describeTransaction(item({ source: "group", kind: "payment", direction: "incoming" }), activity).subtitle).toBe("Paid to you · Group");
    expect(describeTransaction(item({ source: "group", kind: "payment", direction: "outgoing" }), activity).subtitle).toBe("You paid · Group");
  });
});

describe("describeTransaction: flags and fallbacks", () => {
  it("marks future event dates as upcoming", () => {
    expect(describeTransaction(item({ eventDate: "2026-09-15", status: "open" }), activity).upcoming).toBe(true);
    expect(describeTransaction(item({ eventDate: today, status: "open" }), activity).upcoming).toBe(false);
  });

  it("names a blank title after its kind", () => {
    expect(describeTransaction(item({ title: "  " }), activity).title).toBe("Expense");
    expect(describeTransaction(item({ title: "", kind: "loan" }), activity).title).toBe("Loan");
    expect(describeTransaction(item({ title: "", kind: "payment", source: "group" }), activity).title).toBe("Payment");
  });

  it("only personal open rows can be settled", () => {
    expect(describeTransaction(item({ status: "open" }), activity).canSettle).toBe(true);
    expect(describeTransaction(item({ status: "settled" }), activity).canSettle).toBe(false);
    expect(describeTransaction(item({ source: "group", status: "open" }), activity).canSettle).toBe(false);
  });
});
