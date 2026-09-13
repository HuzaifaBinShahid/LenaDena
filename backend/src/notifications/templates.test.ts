import { describe, expect, it } from "vitest";
import { renderNotification } from "./templates.js";

describe("notification templates", () => {
  it("uses the selected social tone", () => {
    const message = renderNotification({ eventType: "debt_reminder", recipientName: "Sara", groupName: "Weekend crew", tone: "cheeky", payload: {} });
    expect(message.text).toContain("wallet has been tagged");
  });

  it("keeps attention messages neutral and proof-free", () => {
    const message = renderNotification({ eventType: "payment_needs_attention", recipientName: "Sara", groupName: "Weekend crew", tone: "chaos", payload: { proofUri: "https://secret.invalid/proof" } });
    expect(message.text).toContain("could not confirm");
    expect(message.html).not.toContain("secret.invalid");
  });

  it("labels payer fallback without implying recipient confirmation", () => {
    const message = renderNotification({ eventType: "payment_self_confirmed", recipientName: "Sara", groupName: "Weekend crew", tone: "friendly", payload: { proofUri: "https://secret.invalid/proof" } });
    expect(message.subject).toBe("Payment marked settled by payer");
    expect(message.text).toContain("payer marked this payment settled");
    expect(message.text).toContain("recipient confirmation was unavailable");
    expect(message.html).not.toContain("secret.invalid");
  });
});
