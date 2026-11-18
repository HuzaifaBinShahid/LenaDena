import { describe, expect, it } from "vitest";
import { canRemind, pushSupported, remindOutcome, reminderShareMessage, shouldOfferPushPrompt, targetForNotification } from "./pushRules";

describe("pushSupported", () => {
  it("is for Android builds made with a Firebase file, and nothing else", () => {
    expect(pushSupported({ platform: "android", enabledInBuild: true })).toBe(true);
    expect(pushSupported({ platform: "android", enabledInBuild: false })).toBe(false);
    expect(pushSupported({ platform: "android", enabledInBuild: undefined })).toBe(false);
    expect(pushSupported({ platform: "android", enabledInBuild: "true" })).toBe(false);
    expect(pushSupported({ platform: "ios", enabledInBuild: true })).toBe(false);
    expect(pushSupported({ platform: "web", enabledInBuild: true })).toBe(false);
  });
});

describe("canRemind", () => {
  it("is for someone who owes you, not yourself, not someone who is square, not someone you owe", () => {
    expect(canRemind("me", { id: "hamza", owesYouMinor: 110000 })).toBe(true);
    expect(canRemind("me", { id: "me", owesYouMinor: 110000 })).toBe(false);
    expect(canRemind("me", { id: "sara", owesYouMinor: 0 })).toBe(false);
    expect(canRemind("me", { id: "zain", owesYouMinor: -500 })).toBe(false);
  });
});

describe("remindOutcome", () => {
  it("says it was sent when it was", () => {
    expect(remindOutcome("sent", "Hamza Ali")).toEqual({ kind: "sent", title: "Reminder sent", message: "Hamza got a notification on their phone." });
  });
  it("offers the share sheet in every other case, each with its own honest words", () => {
    for (const status of ["no_device", "failed", "unavailable"] as const) {
      const outcome = remindOutcome(status, "Hamza Ali");
      expect(outcome.kind).toBe("share");
      expect(outcome.title.length).toBeGreaterThan(5);
    }
    expect(remindOutcome("no_device", "Hamza Ali").title).toBe("Hamza isn't getting notifications");
    expect(remindOutcome("failed", "Hamza").message).toContain("doesn't count for today");
  });
  it("copes with an empty name", () => {
    expect(remindOutcome("sent", "  ").message).toBe("They got a notification on their phone.");
  });
});

describe("reminderShareMessage", () => {
  it("is in the owner's voice, with the amount and the group, in a form WhatsApp renders", () => {
    const message = reminderShareMessage({ memberName: "Hamza Ali", amountMinor: 110000, currency: "PKR", groupName: "Flat bills" });
    expect(message).toContain("Hi Hamza 👋");
    expect(message).toContain("You owe me *Rs 1,100* in *Flat bills*.");
    expect(message).toContain("Shared from LenaDena");
    expect(message).not.toContain(" ");
  });
  it("has no greeting name when there is none", () => {
    expect(reminderShareMessage({ memberName: "", amountMinor: 100, currency: "PKR", groupName: "Trip" }).startsWith("A friendly reminder from LenaDena:")).toBe(true);
  });
});

describe("targetForNotification", () => {
  it("opens the group for a reminder and the invitations for an invitation", () => {
    expect(targetForNotification({ type: "nudge", groupId: "1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d" })).toEqual({ kind: "group", groupId: "1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d" });
    expect(targetForNotification({ type: "nudge", groupId: "flat-bills" })).toEqual({ kind: "group", groupId: "flat-bills" });
    expect(targetForNotification({ type: "group_invite", groupId: "x" })).toEqual({ kind: "invitations" });
  });
  it("opens the Payments tab for a payment waiting for confirmation, and the group for the other payment steps", () => {
    expect(targetForNotification({ type: "payment_claimed", groupId: "g1", settlementId: "s1" })).toEqual({ kind: "reviews" });
    for (const type of ["payment_confirmed", "payment_needs_attention", "payment_self_confirmed"]) {
      expect(targetForNotification({ type, groupId: "flat-bills", settlementId: "s1" })).toEqual({ kind: "group", groupId: "flat-bills" });
    }
  });
  it("does not let a payment notification steer anywhere with a bad group id", () => {
    for (const type of ["payment_confirmed", "payment_needs_attention", "payment_self_confirmed"]) {
      expect(targetForNotification({ type, groupId: "../settings" })).toBeNull();
      expect(targetForNotification({ type })).toBeNull();
    }
  });
  it("goes nowhere for anything unexpected, and never lets an id steer to another route", () => {
    for (const data of [null, undefined, "nudge", 5, {}, { type: "other" }, { type: "nudge" }, { type: "nudge", groupId: 7 }, { type: "nudge", groupId: "../settings" }, { type: "nudge", groupId: "a/b" }, { type: "nudge", groupId: "" }, { type: "nudge", groupId: "x".repeat(65) }, { type: "nudge", groupId: "a?b=1" }]) {
      expect(targetForNotification(data)).toBeNull();
    }
  });
});

describe("shouldOfferPushPrompt", () => {
  const ready = { available: true, signedIn: true, alreadyOn: false, alreadyAsked: false, blockedInPhoneSettings: false };
  it("offers it once to a signed-in person on a build that can receive pushes", () => {
    expect(shouldOfferPushPrompt(ready)).toBe(true);
  });
  it("never offers it when any of the conditions is missing", () => {
    for (const change of [{ available: false }, { signedIn: false }, { alreadyOn: true }, { alreadyAsked: true }, { blockedInPhoneSettings: true }]) {
      expect(shouldOfferPushPrompt({ ...ready, ...change })).toBe(false);
    }
  });
});
