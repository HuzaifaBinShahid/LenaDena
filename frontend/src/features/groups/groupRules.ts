import type { GroupPerson, PendingInvitation } from "../ledger/types";

/**
 * The pure parts of group management, kept out of the screens so they can be tested. The server is the authority: it
 * refuses anything these let through. Mirrors supabase/migrations/202611170015_group_members.sql.
 */

/** The same loose shape the server checks, so an address is never accepted here and refused there. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function inviteEmailError(value: string): string | undefined {
  const email = value.trim();
  if (!email) return "Enter their email address.";
  if (email.length > 254 || !EMAIL.test(email)) return "Enter a valid email address.";
  return undefined;
}

export type Viewer = { id: string; role: "owner" | "admin" | "member" };

/** The owner may remove anyone but themselves; an admin may remove ordinary members; nobody removes the owner. */
export function canRemoveMember(viewer: Viewer, member: Pick<GroupPerson, "id" | "role">): boolean {
  if (member.id === viewer.id || member.role === "owner") return false;
  if (viewer.role === "owner") return true;
  return viewer.role === "admin" && member.role === "member";
}

/** Why a removal would be refused right now, in words; undefined when it would go through. */
export function removeBlockedText(member: Pick<GroupPerson, "name" | "settled">): string | undefined {
  return member.settled ? undefined : `${member.name} has to settle up first: they owe or are owed money here, or a payment is waiting for review.`;
}

/** Why the viewer cannot leave right now, or undefined. `others` is how many other people are in the group. */
export function leaveBlockedText(viewer: Viewer, others: number, settled: boolean): string | undefined {
  if (viewer.role === "owner" && others > 0) return "You own this group, so you can't leave while others are in it. Remove them first, or ask them to leave.";
  return settled ? undefined : "Settle up first: you owe or are owed money here, or a payment is waiting for review.";
}

export function roleLabel(role: GroupPerson["role"]): string {
  return role === "owner" ? "Owner" : role === "admin" ? "Admin" : "Member";
}

/** "Expires today", "Expires tomorrow", "Expires in 5 days": invitations last 7 days. */
export function expiryText(expiresAt: string, now: Date = new Date()): string {
  const days = Math.ceil((Date.parse(expiresAt) - now.getTime()) / 86_400_000);
  if (days <= 0) return "Expires today";
  return days === 1 ? "Expires tomorrow" : `Expires in ${days} days`;
}

export function invitationsBannerText(count: number): string {
  return count === 1 ? "You have an invitation to a group" : `You have ${count} invitations to groups`;
}

/** Pending invitations, newest first. */
export function sortedInvitations<T extends Pick<PendingInvitation, "createdAt">>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}
