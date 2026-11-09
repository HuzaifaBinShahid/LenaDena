import { describe, expect, it } from "vitest";
import type { TransactionItem } from "../ledger/types";
import { buildEntryShareMessage, buildStatementShareMessage, entryShareTitle, shareDate, statementShareTitle } from "./message";

function entry(overrides: Partial<TransactionItem> = {}): TransactionItem {
  return {
    id: "e1",
    source: "personal",
    title: "Coffee money",
    eventDate: "2026-09-13",
    amountMinor: 185000,
    currency: "PKR",
    direction: "outgoing",
    kind: "expense",
    counterparty: "Ali Raza",
    status: "open",
    settledAmountMinor: 0,
    createdAt: "2026-09-13T08:20:00.000Z",
    ...overrides,
  };
}

const ali = { id: "p1", name: "Ali Raza", createdAt: "2026-09-08T17:45:00.000Z" };
// Noon UTC is the same calendar day in every time zone from UTC-11 to UTC+11.
const NOW = new Date("2026-11-10T12:00:00.000Z");

describe("share dates", () => {
  it("always formats in English", () => {
    expect(shareDate("2026-09-13")).toBe("13 Sep 2026");
    expect(shareDate("2026-01-05")).toBe("5 Jan 2026");
    expect(shareDate("not a date")).toBe("not a date");
  });
});

describe("entry message", () => {
  it("says who owes whom, formatted for WhatsApp", () => {
    const message = buildEntryShareMessage({ entry: entry() });
    expect(message).toContain("Hi Ali 👋 Here's the note for *Coffee money*:");
    expect(message).toContain("🧾 *Coffee money*");
    expect(message).toContain("13 Sep 2026 · Expense");
    expect(message).toContain("💰 Amount: *Rs 1,850*");
    // Nothing paid yet: the amount line is already what is open, so it is not repeated.
    expect(message).not.toContain("Still open");
    expect(message).not.toContain("Paid so far");
    expect(message).toContain("👉 I owe you *Rs 1,850*");
    expect(message).toContain("Shared from LenaDena");
    expect(message).not.toContain(" ");
  });

  it("flips the voice when the other person owes you", () => {
    const message = buildEntryShareMessage({ entry: entry({ direction: "incoming", kind: "loan", title: "Camera loan" }) });
    expect(message).toContain("👉 You owe me *Rs 1,850*");
    expect(message).toContain("· Loan");
  });

  it("shows what was paid and what is left on a part-paid entry", () => {
    const message = buildEntryShareMessage({ entry: entry({ settledAmountMinor: 50000 }) });
    expect(message).toContain("✅ Paid so far: Rs 500");
    expect(message).toContain("⏳ Still open: *Rs 1,350*");
    expect(message).toContain("👉 I owe you *Rs 1,350*");
    expect(message).not.toContain("*Rs 1,850*\n\n👉");
  });

  it("thanks them once it is settled and omits who-owes", () => {
    const message = buildEntryShareMessage({ entry: entry({ status: "settled", settledAmountMinor: 185000 }) });
    expect(message).toContain("✅ Settled in full");
    expect(message).toContain("All square on this one");
    expect(message).not.toContain("👉");
    expect(message).not.toContain("Still open");
  });

  it("includes a note, and greets by the name you pass", () => {
    const message = buildEntryShareMessage({ entry: entry({ note: "  Back on the 15th  " }), personName: "Mani Ahmed" });
    expect(message).toContain("Hi Mani 👋");
    expect(message).toContain("📝 Back on the 15th");
  });

  it("copes with no name at all", () => {
    expect(buildEntryShareMessage({ entry: entry({ counterparty: "" }) }).startsWith("Here's the note for *Coffee money*:")).toBe(true);
  });

  it("titles the share sheet", () => {
    expect(entryShareTitle({ entry: entry() })).toBe("Coffee money · Rs 1,850 with Ali");
  });
});

describe("statement message", () => {
  const entries = [
    entry({ id: "a", title: "Camera rental", eventDate: "2026-11-08", amountMinor: 450000, direction: "incoming", kind: "loan" }),
    entry({ id: "b", title: "Coffee money", eventDate: "2026-09-13", amountMinor: 185000, settledAmountMinor: 50000 }),
    entry({ id: "c", title: "Camera loan", eventDate: "2026-09-08", amountMinor: 1200000, direction: "incoming", kind: "loan", status: "settled", settledAmountMinor: 1200000 }),
  ];

  it("leads with where you stand, then open entries, then what is settled", () => {
    const message = buildStatementShareMessage({ person: ali, entries, ownerName: "Huzaifa Bin Shahid", now: NOW });
    const lines = message.split("\n");
    expect(lines[0]).toBe("📒 *Statement with Ali*");
    expect(lines[1]).toBe("Huzaifa ⇄ Ali · as of 10 Nov 2026");
    // 4,500 owed to you minus 1,350 you owe = 3,150 net, they owe you.
    expect(message).toContain("👉 You owe me *Rs 3,150*");
    expect(message).toContain("*Open entries* (2)");
    expect(message).toContain("• Camera rental · 8 Nov: You owe me Rs 4,500");
    expect(message).toContain("• Coffee money · 13 Sep: I owe you Rs 1,350 (of Rs 1,850)");
    expect(message).toContain("*Settled* (1)");
    expect(message).toContain("✔️ Camera loan · 8 Sep: Rs 12,000");
    expect(message.indexOf("*Where we stand*")).toBeLessThan(message.indexOf("*Open entries*"));
    expect(message.indexOf("*Open entries*")).toBeLessThan(message.indexOf("*Settled*"));
    expect(message).not.toContain(" ");
  });

  it("lists newest open entries first", () => {
    const message = buildStatementShareMessage({ person: ali, entries, now: NOW });
    expect(message.indexOf("Camera rental")).toBeLessThan(message.indexOf("Coffee money"));
  });

  it("says all square when nothing is open", () => {
    const message = buildStatementShareMessage({ person: ali, entries: [entries[2]!], now: NOW });
    expect(message).toContain("✅ All square. Nothing is open.");
    expect(message).not.toContain("*Open entries*");
  });

  it("says so when there are no entries yet", () => {
    expect(buildStatementShareMessage({ person: ali, entries: [], now: NOW })).toContain("Nothing tracked yet.");
  });

  it("gives every currency its own line", () => {
    const message = buildStatementShareMessage({
      person: ali,
      entries: [entry({ id: "u", currency: "USD", amountMinor: 2500, direction: "incoming" }), entry({ id: "p", amountMinor: 100000 })],
      now: NOW,
    });
    expect(message).toMatch(/👉 You owe me \*US\$25\*/);
    expect(message).toContain("👉 I owe you *Rs 1,000*");
  });

  it("caps long lists and says how many were left out", () => {
    const many = Array.from({ length: 30 }, (_, index) => entry({ id: `o${index}`, title: `Open ${index}`, eventDate: "2026-10-01", amountMinor: 1000 }));
    const old = Array.from({ length: 12 }, (_, index) => entry({ id: `s${index}`, title: `Done ${index}`, status: "settled", settledAmountMinor: 1000, amountMinor: 1000 }));
    const message = buildStatementShareMessage({ person: ali, entries: [...many, ...old], now: NOW });
    expect(message).toContain("*Open entries* (30)");
    expect(message).toContain("…and 10 more open entries");
    expect(message).toContain("…and 4 older settled entries");
  });

  it("titles the share sheet", () => {
    expect(statementShareTitle({ person: ali, now: NOW })).toBe("Statement with Ali · 10 Nov 2026");
  });
});
