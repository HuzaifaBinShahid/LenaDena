import { describe, expect, it } from "vitest";
import { invitationMessage, nudgeMessage, paymentMessage, PUSH_CHANNEL } from "./messages.js";

describe("nudgeMessage", () => {
  const base = { senderName: "Sara Khan", amountMinor: 30000, currency: "PKR", groupId: "g1", groupName: "Weekend crew" };
  it("names the sender by first name, with the amount and the group, and carries what a tap needs", () => {
    const message = nudgeMessage(base);
    expect(message.title).toBe("Sara sent you a reminder");
    expect(message.body).toContain("You owe Sara");
    expect(message.body).toMatch(/Rs.300/);
    expect(message.body).toContain("Weekend crew");
    expect(message.data).toEqual({ type: "nudge", groupId: "g1" });
    expect(message.channelId).toBe(PUSH_CHANNEL);
  });
  it("sends only strings in the data, as Firebase requires", () => {
    expect(Object.values(nudgeMessage(base).data).every((value) => typeof value === "string")).toBe(true);
  });
  it("cleans names: control characters and line breaks never reach a lock screen", () => {
    const message = nudgeMessage({ ...base, senderName: "Sa\u0007ra Khan", groupName: "Trip\r\n  to   Hunza" });
    expect(message.title).toBe("Sa ra sent you a reminder");
    expect(message.body).toContain("Trip to Hunza");
    expect(message.body).not.toMatch(/[\n\r\u0007]/);
  });
  it("says something sensible, with no wrong figure, when the amount or currency is unusable", () => {
    const message = nudgeMessage({ ...base, currency: "??", amountMinor: Number.NaN });
    expect(message.body).toBe("You have something to settle with Sara in Weekend crew. Tap to open it.");
  });
  it("falls back to 'A friend' for an empty name", () => {
    expect(nudgeMessage({ ...base, senderName: "   " }).title).toBe("A friend sent you a reminder");
  });
});

describe("invitationMessage", () => {
  it("says who invited you to what, and tells the app which group", () => {
    const message = invitationMessage({ inviterName: "Sara Khan", groupName: "Weekend crew", groupId: "g1" });
    expect(message.title).toBe("Sara invited you to Weekend crew");
    expect(message.body).toBe("Open LenaDena to accept or decline.");
    expect(message.data).toEqual({ type: "group_invite", groupId: "g1" });
    expect(message.channelId).toBe(PUSH_CHANNEL);
  });
});

describe("paymentMessage", () => {
  const base = { actorName: "Hamza Ali", amountMinor: 110000, currency: "PKR", groupId: "g1", groupName: "Flat bills", settlementId: "s1" };
  it("asks the recipient to confirm when the payer says they paid", () => {
    const message = paymentMessage({ ...base, event: "claimed" });
    expect(message.title).toBe("Hamza says they paid you");
    expect(message.body).toMatch(/Rs.1,100 in Flat bills\. Tap to confirm it\./);
    expect(message.data).toEqual({ type: "payment_claimed", groupId: "g1", settlementId: "s1" });
    expect(message.channelId).toBe(PUSH_CHANNEL);
  });
  it("tells the payer their payment was confirmed", () => {
    const message = paymentMessage({ ...base, actorName: "Sara Khan", event: "confirmed" });
    expect(message.title).toBe("Sara confirmed your payment");
    expect(message.body).toMatch(/is settled\.$/);
    expect(message.data.type).toBe("payment_confirmed");
  });
  it("tells the payer their payment needs a look", () => {
    const message = paymentMessage({ ...base, actorName: "Sara Khan", event: "needs_attention" });
    expect(message.title).toBe("Sara says your payment needs a look");
    expect(message.data.type).toBe("payment_needs_attention");
  });
  it("tells the recipient the payer marked it settled", () => {
    const message = paymentMessage({ ...base, event: "self_confirmed" });
    expect(message.title).toBe("Hamza marked a payment as settled");
    expect(message.body).toContain("check it");
    expect(message.data.type).toBe("payment_self_confirmed");
  });
  it("sends only strings in the data, as Firebase requires", () => {
    expect(Object.values(paymentMessage({ ...base, event: "claimed" }).data).every((value) => typeof value === "string")).toBe(true);
  });
  it("cleans names so control characters and line breaks never reach a lock screen", () => {
    const message = paymentMessage({ ...base, actorName: "Ha\u0007mza", groupName: "Flat\r\n  bills", event: "claimed" });
    expect(message.title).toBe("Ha mza says they paid you");
    expect(message.body).toContain("Flat bills");
    expect(message.body).not.toMatch(/[\n\r\u0007]/);
  });
  it("leaves the amount out rather than showing a wrong one", () => {
    const message = paymentMessage({ ...base, amountMinor: Number.NaN, currency: "??", event: "claimed" });
    expect(message.body).toBe("Flat bills. Tap to confirm it.");
  });
  it("falls back to 'A friend' and 'your group' for empty names", () => {
    const message = paymentMessage({ ...base, actorName: " ", groupName: " ", event: "confirmed" });
    expect(message.title).toBe("A friend confirmed your payment");
    expect(message.body).toContain("your group");
  });
});
