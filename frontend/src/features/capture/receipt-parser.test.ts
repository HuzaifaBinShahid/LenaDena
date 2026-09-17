import { describe, expect, it } from "vitest";
import { parseReceiptText } from "./receipt-parser";

describe("parseReceiptText", () => {
  it("suggests the strongest total and a numeric date", () => {
    const result = parseReceiptText("Monal Islamabad\n12/09/2026\nSubtotal 5,500\nTOTAL PKR 6,000.00");
    expect(result).toEqual({ amount: "6000.00", date: "2026-09-12", eventName: "Monal Islamabad" });
  });

  it("understands a named English date", () => {
    const result = parseReceiptText("Coffee House\n5 Sep 2026\nAmount 850");
    expect(result.date).toBe("2026-09-05");
  });

  it("prefers a labelled total over a larger invoice number or subtotal", () => {
    const result = parseReceiptText("Store 22\nInvoice 900012\nSubtotal 8,500\nGST 1,275\nGrand total: Rs 9,775.00");
    expect(result.amount).toBe("9775.00");
  });
});
