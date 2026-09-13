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
});
