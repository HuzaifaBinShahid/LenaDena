import { describe, expect, it } from "vitest";
import { parseVoiceDraft } from "./grammar";

const options = { today: "2026-10-27", defaultCurrency: "PKR", people: [{ name: "Ali" }, { name: "Sharjeel" }] };

describe("parseVoiceDraft", () => {
  it("extracts a complete outgoing expense", () => {
    expect(parseVoiceDraft("Add 500 rupees, I owe Ali for chai yesterday", options)).toMatchObject({
      amountMinor: 50000, currency: "PKR", kind: "expense", direction: "outgoing", counterparty: "Ali", title: "chai", eventDate: "2026-10-26", missing: [],
    });
  });

  it("understands an incoming loan and number words", () => {
    expect(parseVoiceDraft("I lent Sharjeel fifteen hundred cash for books", options)).toMatchObject({
      amountMinor: 150000, kind: "loan", direction: "incoming", counterparty: "Sharjeel", title: "books", missing: [],
    });
  });

  it("does not guess missing person or direction", () => {
    expect(parseVoiceDraft("Add 300 rupees for chai", options)).toMatchObject({
      amountMinor: 30000, title: "chai", missing: ["direction", "person"],
    });
  });

  it("keeps a newly spoken person available for confirmation", () => {
    expect(parseVoiceDraft("I lent Zara 900 rupees for groceries", { ...options, people: [] })).toMatchObject({
      amountMinor: 90000, direction: "incoming", counterparty: "zara", title: "groceries", missing: [],
    });
  });
});
