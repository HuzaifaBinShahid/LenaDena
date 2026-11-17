import { describe, expect, it } from "vitest";
import { canRemoveMember, expiryText, inviteEmailError, invitationsBannerText, leaveBlockedText, removeBlockedText, roleLabel, sortedInvitations } from "./groupRules";

describe("inviteEmailError", () => {
  it("accepts an ordinary address, with spaces around it", () => {
    expect(inviteEmailError("sara@example.com")).toBeUndefined();
    expect(inviteEmailError("  Sara.Khan+lena@example.co.uk ")).toBeUndefined();
  });

  it("asks for an address when empty, and refuses anything that is not one", () => {
    expect(inviteEmailError("")).toBe("Enter their email address.");
    expect(inviteEmailError("   ")).toBe("Enter their email address.");
    for (const bad of ["sara", "sara@", "@example.com", "sara@example", "a b@example.com", `${"a".repeat(250)}@example.com`]) {
      expect(inviteEmailError(bad)).toBe("Enter a valid email address.");
    }
  });
});

describe("canRemoveMember", () => {
  const member = (role: "owner" | "admin" | "member", id = "m1") => ({ id, role });
  it("lets the owner remove an admin or a member, but not themselves", () => {
    const owner = { id: "o", role: "owner" as const };
    expect(canRemoveMember(owner, member("admin"))).toBe(true);
    expect(canRemoveMember(owner, member("member"))).toBe(true);
    expect(canRemoveMember(owner, member("owner", "o"))).toBe(false);
  });

  it("lets an admin remove ordinary members only", () => {
    const admin = { id: "a", role: "admin" as const };
    expect(canRemoveMember(admin, member("member"))).toBe(true);
    expect(canRemoveMember(admin, member("admin"))).toBe(false);
    expect(canRemoveMember(admin, member("owner", "o"))).toBe(false);
  });

  it("never lets an ordinary member remove anyone, and nobody removes the owner", () => {
    expect(canRemoveMember({ id: "x", role: "member" }, member("member"))).toBe(false);
    expect(canRemoveMember({ id: "a", role: "admin" }, member("owner", "o"))).toBe(false);
  });
});

describe("blocked reasons", () => {
  it("says a member has to settle up, and says nothing when they have", () => {
    expect(removeBlockedText({ name: "Hamza", settled: false })).toMatch(/Hamza has to settle up first/);
    expect(removeBlockedText({ name: "Hamza", settled: true })).toBeUndefined();
  });

  it("keeps the owner in while others remain, then asks to settle", () => {
    expect(leaveBlockedText({ id: "o", role: "owner" }, 2, true)).toMatch(/You own this group/);
    expect(leaveBlockedText({ id: "o", role: "owner" }, 0, true)).toBeUndefined();
    expect(leaveBlockedText({ id: "m", role: "member" }, 3, false)).toMatch(/Settle up first/);
    expect(leaveBlockedText({ id: "m", role: "member" }, 3, true)).toBeUndefined();
  });
});

describe("words", () => {
  it("labels roles", () => {
    expect(["owner", "admin", "member"].map((role) => roleLabel(role as "owner"))).toEqual(["Owner", "Admin", "Member"]);
  });

  it("counts the days an invitation has left", () => {
    const now = new Date("2026-11-17T10:00:00Z");
    expect(expiryText("2026-11-24T10:00:00Z", now)).toBe("Expires in 7 days");
    expect(expiryText("2026-11-19T09:00:00Z", now)).toBe("Expires in 2 days");
    expect(expiryText("2026-11-18T09:00:00Z", now)).toBe("Expires tomorrow");
    expect(expiryText("2026-11-17T20:00:00Z", now)).toBe("Expires tomorrow");
    expect(expiryText("2026-11-17T09:00:00Z", now)).toBe("Expires today");
  });

  it("words the banner for one and for several", () => {
    expect(invitationsBannerText(1)).toBe("You have an invitation to a group");
    expect(invitationsBannerText(3)).toBe("You have 3 invitations to groups");
  });

  it("sorts invitations newest first without changing the list it was given", () => {
    const list = [{ id: "a", createdAt: "2026-11-01T00:00:00Z" }, { id: "b", createdAt: "2026-11-03T00:00:00Z" }, { id: "c", createdAt: "2026-11-02T00:00:00Z" }];
    expect(sortedInvitations(list).map((item) => item.id)).toEqual(["b", "c", "a"]);
    expect(list.map((item) => item.id)).toEqual(["a", "b", "c"]);
  });
});
