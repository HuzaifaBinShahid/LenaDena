import { describe, expect, it } from "vitest";
import { buildCsv, exportContentType, exportFileName, minorToDecimal, type ExportDocument } from "./export.js";

const base: ExportDocument = {
  format: "lenadena-export", version: 1, exportedAt: "2026-11-17T10:00:00.000Z",
  account: { name: "Sara Khan", email: "sara@example.com", createdAt: "2026-09-01T09:00:00.000Z" },
  groups: [], expenses: [], payments: [], individualBalances: [], people: [], activity: [], emails: [],
};
const lines = (csv: string) => csv.replace(/^﻿/, "").split("\r\n").filter(Boolean);

describe("minorToDecimal", () => {
  it("always writes two decimals, so a spreadsheet reads a number", () => {
    expect(minorToDecimal(123456)).toBe("1234.56");
    expect(minorToDecimal(100)).toBe("1.00");
    expect(minorToDecimal(7)).toBe("0.07");
    expect(minorToDecimal(0)).toBe("0.00");
    expect(minorToDecimal(185000)).toBe("1850.00");
  });
});

describe("file names and types", () => {
  it("names the file by day and format", () => {
    expect(exportFileName("json", new Date("2026-11-17T23:59:59Z"))).toBe("lenadena-export-2026-11-17.json");
    expect(exportFileName("csv", new Date("2026-01-02T00:00:00Z"))).toBe("lenadena-export-2026-01-02.csv");
  });

  it("serves each as the right kind of file", () => {
    expect(exportContentType("csv")).toBe("text/csv; charset=utf-8");
    expect(exportContentType("json")).toBe("application/json; charset=utf-8");
  });
});

describe("buildCsv", () => {
  it("is just the header for an empty account, with a byte-order mark and CRLF line ends", () => {
    const csv = buildCsv(base);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(lines(csv)).toEqual(["Type,Date,Title,Group or person,Direction,Amount,Currency,My share,Paid so far,Status,Note,Added,Edited"]);
  });

  it("writes individual balances, group expenses and payments in one table, newest first", () => {
    const csv = buildCsv({
      ...base,
      individualBalances: [{ title: "Lunch with Bilal", date: "2026-11-01", person: "Bilal", kind: "expense", direction: "outgoing", amountMinor: 50000, currency: "PKR", paidMinor: 20000, status: "open", note: "tea", hasReceipt: false, createdAt: "2026-11-01T08:00:00Z" }],
      expenses: [{ group: "Weekend crew", title: "Dinner", date: "2026-11-03", amountMinor: 90000, currency: "PKR", paidBy: "Sara Khan", paidByMe: true, splitMethod: "equal", hasReceipt: true, createdAt: "2026-11-03T19:00:00Z", editedAt: "2026-11-04T09:00:00Z", shares: [{ person: "Hamza Ali", isMe: false, amountMinor: 30000 }, { person: "Sara Khan", isMe: true, amountMinor: 30000 }] },
        { group: "Office lunch", title: "Pizza", date: "2026-10-20", amountMinor: 60000, currency: "PKR", paidBy: "Hamza Ali", paidByMe: false, splitMethod: "equal", hasReceipt: false, createdAt: "2026-10-20T12:00:00Z", shares: [{ person: "Sara Khan", isMe: true, amountMinor: 30000 }] }],
      payments: [{ group: "Weekend crew", from: "Hamza Ali", to: "Sara Khan", fromMe: false, amountMinor: 1000, currency: "PKR", status: "confirmed", note: "bank", hasProof: true, createdAt: "2026-11-05T10:00:00Z" }],
    });
    expect(lines(csv).slice(1)).toEqual([
      "Payment,2026-11-05,Hamza Ali to Sara Khan,Weekend crew,I received,10.00,PKR,,,confirmed,bank,2026-11-05,",
      "Group expense,2026-11-03,Dinner,Weekend crew,I paid,900.00,PKR,300.00,,,,2026-11-03,2026-11-04",
      "Individual balance,2026-11-01,Lunch with Bilal,Bilal,I owe,500.00,PKR,,200.00,open,tea,2026-11-01,",
      "Group expense,2026-10-20,Pizza,Office lunch,Hamza Ali paid,600.00,PKR,300.00,,,,2026-10-20,",
    ]);
  });

  it("labels the direction of balances and payments from the person's point of view", () => {
    const csv = buildCsv({
      ...base,
      individualBalances: [{ title: "Loan", date: "2026-11-01", person: "Ali", kind: "loan", direction: "incoming", amountMinor: 100, currency: "PKR", paidMinor: 0, status: "open", hasReceipt: false, createdAt: "2026-11-01T00:00:00Z" }],
      payments: [{ group: "G", from: "Sara", to: "Hamza", fromMe: true, amountMinor: 100, currency: "PKR", status: "confirmed", hasProof: false, createdAt: "2026-11-02T00:00:00Z" }],
    });
    expect(csv).toContain("Owed to me");
    expect(csv).toContain("I paid");
  });

  it("quotes fields with commas, quotes and line breaks, and doubles inner quotes", () => {
    const csv = buildCsv({ ...base, individualBalances: [{ title: 'He said "hi", twice', date: "2026-11-01", person: "A, B", kind: "expense", direction: "outgoing", amountMinor: 100, currency: "PKR", paidMinor: 0, status: "open", note: "line one\nline two", hasReceipt: false, createdAt: "2026-11-01T00:00:00Z" }] });
    expect(csv).toContain('"He said ""hi"", twice"');
    expect(csv).toContain('"A, B"');
    expect(csv).toContain('"line one\nline two"');
  });

  it("keeps a spreadsheet from running text another group member typed as a formula", () => {
    const evil = ['=HYPERLINK("http://evil.example","click")', "+1+1", "-2+3", "@SUM(A1)", "\tcmd", "\rcmd"];
    for (const value of evil) {
      const csv = buildCsv({ ...base, expenses: [{ group: value, title: value, date: "2026-11-03", amountMinor: 100, currency: "PKR", paidBy: "X", paidByMe: false, splitMethod: "equal", note: value, hasReceipt: false, createdAt: "2026-11-03T00:00:00Z", shares: [] }] });
      const row = csv.replace(/^﻿/, "").split("\r\n")[1]!;
      expect(row.startsWith("Group expense,2026-11-03,'") || row.startsWith('Group expense,2026-11-03,"\'')).toBe(true);
      expect(row).not.toMatch(/,[=+\-@]/);
    }
  });

  it("does not touch text that only contains those characters, and writes numbers as numbers", () => {
    const csv = buildCsv({ ...base, individualBalances: [{ title: "Dinner = fun", date: "2026-11-01", person: "A-B", kind: "expense", direction: "outgoing", amountMinor: 12345, currency: "PKR", paidMinor: 0, status: "open", hasReceipt: false, createdAt: "2026-11-01T00:00:00Z" }] });
    expect(lines(csv)[1]).toBe("Individual balance,2026-11-01,Dinner = fun,A-B,I owe,123.45,PKR,,0.00,open,,2026-11-01,");
  });

  it("keeps names in any script intact", () => {
    const csv = buildCsv({ ...base, individualBalances: [{ title: "کھانا", date: "2026-11-01", person: "علی", kind: "expense", direction: "outgoing", amountMinor: 100, currency: "PKR", paidMinor: 0, status: "open", hasReceipt: false, createdAt: "2026-11-01T00:00:00Z" }] });
    expect(csv).toContain("کھانا");
    expect(csv).toContain("علی");
  });
});
