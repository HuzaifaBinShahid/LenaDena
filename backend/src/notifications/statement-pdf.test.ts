import { describe, expect, it } from "vitest";
import { renderStatementPdf, statementFileName } from "./statement-pdf.js";
import type { StatementData, StatementEntry } from "./statement.js";

function entry(overrides: Partial<StatementEntry> & { id: string }): StatementEntry {
  return {
    title: "Dinner",
    eventDate: "2026-09-13",
    amountMinor: 185_000,
    paidMinor: 0,
    currency: "PKR",
    direction: "incoming",
    kind: "expense",
    status: "open",
    ...overrides,
  };
}

function statement(overrides: Partial<StatementData> = {}): StatementData {
  const entries = overrides.entries ?? [
    entry({ id: "1", title: "Dinner at Monal", eventDate: "2026-11-08", amountMinor: 640_000, note: "Split four ways; Ali's share of the bill." }),
    entry({ id: "2", title: "Loan for laptop repair", kind: "loan", amountMinor: 4_500_000, paidMinor: 1_500_000, eventDate: "2026-10-28" }),
    entry({ id: "3", title: "Groceries", amountMinor: 320_000, paidMinor: 320_000, status: "settled", direction: "outgoing", eventDate: "2026-10-21" }),
  ];
  return {
    ownerName: "Huzaifa Bin Shahid",
    personName: "Ali Raza",
    generatedAt: "2026-11-10T09:30:00.000Z",
    entries,
    totals: [{ currency: "PKR", personOwesMinor: 4_640_000, ownerOwesMinor: 0 }],
    entryCount: entries.length,
    openCount: entries.filter((candidate) => candidate.status === "open").length,
    ...overrides,
  };
}

/** Page objects in the file: `/Type /Page` but not `/Type /Pages`. */
function pageCount(pdf: Buffer): number {
  return pdf.toString("latin1").match(/\/Type \/Page\b/g)?.length ?? 0;
}

/** pdfkit writes plain ASCII info values as `(text)` and anything else as UTF-16BE hex, so a title can be found without a PDF parser. */
function hasInfoString(pdf: Buffer, text: string): boolean {
  const body = pdf.toString("latin1");
  const hex = Buffer.from(text, "utf16le").swap16().toString("hex");
  return body.includes(`(${text})`) || body.toLowerCase().includes(hex);
}

describe("renderStatementPdf", () => {
  it("renders a normal statement as a PDF", async () => {
    const pdf = await renderStatementPdf(statement());
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(5 * 1024);
    expect(pdf.subarray(-6).toString("latin1")).toContain("%%EOF");
    expect(pageCount(pdf)).toBe(1);
  });

  it("is A4, set in the bundled Manrope only, with the metadata filled in", async () => {
    const pdf = await renderStatementPdf(statement());
    const text = pdf.toString("latin1");
    expect(text).toContain("/MediaBox [0 0 595.28 841.89]");
    expect(text).toContain("Manrope-ExtraBold");
    expect(text).not.toContain("Helvetica");
    expect(hasInfoString(pdf, "Statement: Huzaifa Bin Shahid and Ali Raza")).toBe(true);
    expect(hasInfoString(pdf, "LenaDena")).toBe(true);
    expect(text).toContain("D:20261110093000Z");
  });

  it("renders the same bytes for the same snapshot", async () => {
    const first = await renderStatementPdf(statement());
    const second = await renderStatementPdf(statement());
    expect(second.equals(first)).toBe(true);
  });

  it("renders with no entries and no totals", async () => {
    const pdf = await renderStatementPdf(statement({ entries: [], totals: [], entryCount: 0, openCount: 0 }));
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(5 * 1024);
    expect(pageCount(pdf)).toBe(1);
  });

  it("flows 150 entries over several pages", async () => {
    const entries = Array.from({ length: 150 }, (_, index) =>
      entry({
        id: String(index),
        title: `Shared taxi number ${index + 1}`,
        eventDate: `2026-0${(index % 9) + 1}-1${index % 9}`,
        amountMinor: 100_000 + index * 1_300,
        paidMinor: index % 3 === 0 ? 20_000 : 0,
        status: index % 5 === 0 ? "settled" : "open",
        direction: index % 2 === 0 ? "incoming" : "outgoing",
        ...(index % 7 === 0 ? { note: "A short note that explains what this one was for." } : {}),
      }),
    );
    const pdf = await renderStatementPdf(statement({ entries, entryCount: 150, openCount: 120 }));
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pageCount(pdf)).toBeGreaterThan(3);
  }, 20_000);

  it("says so when the list is cut short", async () => {
    const pdf = await renderStatementPdf(statement({ entryCount: 412, openCount: 130 }));
    expect(pdf.length).toBeGreaterThan(5 * 1024);
  });

  it("does not throw on emoji, Arabic, CJK, combining marks, controls or very long unbroken strings", async () => {
    const unbroken = "Supercalifragilisticexpialidocious".repeat(12);
    const pdf = await renderStatementPdf(
      statement({
        ownerName: "علي حسن 😀 Ali Hassan",
        personName: `José 👨\u200D👩\u200D👧\u200D👦 ${unbroken}`,
        entries: [
          entry({ id: "a", title: "Dinner 🍕 with friends – 今日は – مطعم", note: `ملاحظة ${unbroken} ${"word ".repeat(60)}` }),
          entry({ id: "b", title: unbroken, amountMinor: 99_999_999_999_999, currency: "USD" }),
          entry({ id: "c", title: "Zero\u200Bwidth\u200D joiners\uFE0F and\u0007 controls\u202E", note: "\u0301\u0301 lone combining marks" }),
          entry({ id: "d", title: "👨\u200D👩\u200D👧\u200D👦", status: "settled", note: "😀😀😀" }),
        ],
        totals: [{ currency: "PKR", personOwesMinor: 123_456_789_012, ownerOwesMinor: 0 }],
        entryCount: 4,
        openCount: 3,
      }),
    );
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(5 * 1024);
  });

  it("renders USD and a mixed PKR + USD + even + one-way set of totals", async () => {
    const usd = await renderStatementPdf(
      statement({
        entries: [entry({ id: "u", title: "Flight share", currency: "USD", amountMinor: 45_000 })],
        totals: [{ currency: "USD", personOwesMinor: 45_000, ownerOwesMinor: 0 }],
      }),
    );
    expect(usd.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    const mixed = await renderStatementPdf(
      statement({
        entries: [
          entry({ id: "p", title: "Rent top-up", amountMinor: 2_500_000 }),
          entry({ id: "u", title: "Flight share", currency: "USD", amountMinor: 45_000, direction: "outgoing" }),
          entry({ id: "e", title: "Souvenirs", currency: "EUR", amountMinor: 12_345 }),
        ],
        totals: [
          { currency: "PKR", personOwesMinor: 2_500_000, ownerOwesMinor: 500_000 },
          { currency: "USD", personOwesMinor: 0, ownerOwesMinor: 45_000 },
          { currency: "EUR", personOwesMinor: 20_000, ownerOwesMinor: 20_000 },
        ],
      }),
    );
    expect(mixed.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(mixed.length).toBeGreaterThan(5 * 1024);
  });

  it("copes with a bad currency code, a bad date and the same first name on both sides", async () => {
    const pdf = await renderStatementPdf(
      statement({
        ownerName: "Ali Khan",
        personName: "Ali Raza",
        entries: [entry({ id: "x", currency: "XX", eventDate: "2026-13-45" }), entry({ id: "y", currency: "ZZZ", amountMinor: 1 })],
        totals: [{ currency: "ZZZ", personOwesMinor: 1, ownerOwesMinor: 0 }],
        generatedAt: "not a date",
      }),
    );
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});

describe("statementFileName", () => {
  const generatedAt = "2026-11-10T23:30:00.000Z";

  it("uses the person's name and the UTC date", () => {
    expect(statementFileName({ personName: "Ali", generatedAt })).toBe("LenaDena-statement-Ali-2026-11-10.pdf");
    expect(statementFileName({ personName: "Ali Raza", generatedAt })).toBe("LenaDena-statement-AliRaza-2026-11-10.pdf");
  });

  it("strips everything that is not an ASCII letter or digit, accents included", () => {
    expect(statementFileName({ personName: "José O'Neil-Smith/../x", generatedAt })).toBe("LenaDena-statement-JoseONeilSmithx-2026-11-10.pdf");
    expect(statementFileName({ personName: "A\u0000b\\c:d*e?f\"g<h>i|j k", generatedAt })).toBe("LenaDena-statement-Abcdefghijk-2026-11-10.pdf");
  });

  it("falls back to 'statement' when nothing printable is left", () => {
    expect(statementFileName({ personName: "علي 😀", generatedAt })).toBe("LenaDena-statement-statement-2026-11-10.pdf");
    expect(statementFileName({ personName: "", generatedAt })).toBe("LenaDena-statement-statement-2026-11-10.pdf");
  });

  it("caps a very long name and takes the date in UTC", () => {
    const name = statementFileName({ personName: "A".repeat(200), generatedAt: "2026-11-10T23:59:59.000Z" });
    expect(name).toBe(`LenaDena-statement-${"A".repeat(40)}-2026-11-10.pdf`);
    expect(statementFileName({ personName: "Ali", generatedAt: "2026-11-11T00:00:00+05:00" })).toBe("LenaDena-statement-Ali-2026-11-10.pdf");
  });

  it("never throws on an unparsable timestamp", () => {
    expect(statementFileName({ personName: "Ali", generatedAt: "nope" })).toMatch(/^LenaDena-statement-Ali-\d{4}-\d{2}-\d{2}\.pdf$/);
  });
});
