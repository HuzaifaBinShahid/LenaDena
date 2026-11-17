import { describe, expect, it } from "vitest";
import { invitationMessage, nudgeMessage, PUSH_CHANNEL } from "./messages.js";

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
