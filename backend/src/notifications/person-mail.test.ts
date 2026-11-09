import { describe, expect, it } from "vitest";
import { personMailExtras } from "./person-mail.js";

const entry = { id: "e1", title: "Coffee money", eventDate: "2026-09-13", amountMinor: 185000, paidMinor: 0, currency: "PKR", direction: "outgoing", kind: "expense", status: "open" };
const payload = {
  personName: "Ali Raza",
  ownerName: "Huzaifa Bin Shahid",
  ownerEmail: "huzaifa@example.com",
  generatedAt: "2026-11-10T09:30:00.000Z",
  entryCount: 1,
  openCount: 1,
  entries: [entry],
  totals: [{ currency: "PKR", personOwesMinor: 0, ownerOwesMinor: 185000 }],
};

describe("personMailExtras", () => {
  it("attaches the PDF to a statement and points replies at the account owner", async () => {
    const extras = await personMailExtras("person_statement", payload);
    expect(extras.replyTo).toEqual({ name: "Huzaifa Bin Shahid", address: "huzaifa@example.com" });
    expect(extras.attachments).toHaveLength(1);
    const [pdf] = extras.attachments;
    expect(pdf?.filename).toMatch(/^LenaDena-statement-AliRaza-2026-11-10\.pdf$/);
    expect(pdf?.contentType).toBe("application/pdf");
    expect(pdf?.content.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("sends entry and reminder emails with a Reply-To but no attachment", async () => {
    for (const eventType of ["person_entry", "person_reminder"]) {
      const extras = await personMailExtras(eventType, payload);
      expect(extras.attachments).toEqual([]);
      expect(extras.replyTo?.address).toBe("huzaifa@example.com");
    }
  });

  it("adds nothing to emails that are not for a saved person", async () => {
    for (const eventType of ["expense_added", "person_invite", "debt_reminder", "something_new"]) {
      expect(await personMailExtras(eventType, payload)).toEqual({ attachments: [] });
    }
  });

  it("drops an unusable owner address instead of risking a header, and still sends the email", async () => {
    for (const ownerEmail of [undefined, null, "", "not an address", "a@b.c\r\nBcc: victim@example.com", "<x@y.z>", "a@b", 42]) {
      const extras = await personMailExtras("person_entry", { ...payload, ownerEmail });
      expect(extras.replyTo).toBeUndefined();
    }
    const withLineBreakName = await personMailExtras("person_entry", { ...payload, ownerName: "Huzaifa\r\nBcc: x@y.z" });
    expect(withLineBreakName.replyTo?.name).toBe("Huzaifa Bcc: x@y.z");
  });

  it("still builds the PDF from a statement with nothing usable in it", async () => {
    const extras = await personMailExtras("person_statement", { personName: "Ali", ownerName: "Huzaifa", entries: "nope", totals: null });
    expect(extras.attachments[0]?.content.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});
