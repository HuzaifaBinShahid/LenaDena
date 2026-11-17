import { ConflictError, DomainError, ForbiddenError, NotFoundError } from "./errors.js";

/**
 * Group management: invitations by email (with an in-app Accept / Decline for people who already have an account),
 * leaving, removing and renaming. The rules live in supabase/migrations/202611170015_group_members.sql; this turns what
 * it raises into clear API errors.
 */

export type Invitation = { id: string; groupId: string; groupName: string; invitedBy: string; createdAt: string; expiresAt: string };

export type GroupPerson = {
  id: string;
  name: string;
  /** Storage path of the photo; the API replaces it with `avatarUrl` (a short-lived link). */
  avatarPath?: string;
  avatarUrl?: string;
  role: "owner" | "admin" | "member";
  /** Settled and nothing waiting for review, so they can leave or be removed. No amount is shown. */
  settled: boolean;
  /** What this person owes the caller in this group; negative means the caller owes them. */
  owesYouMinor: number;
  joinedAt: string;
};

export type PendingInvitation = { id: string; email: string; invitedBy: string; createdAt: string; expiresAt: string };

export type GroupPeople = { canManage: boolean; members: GroupPerson[]; invitations: PendingInvitation[] };

/** The database does not have the group-management functions yet. */
export class GroupsUnavailableError extends DomainError {
  constructor() {
    super("Managing groups isn't switched on yet. Try again after the next update.", 503, "groups_unavailable");
  }
}

/** What the group-management functions raise, as the API's own errors. */
export function toGroupError(text: string): DomainError {
  if (text.includes("group_not_found") || text.includes("group membership required")) return new NotFoundError("Group not found");
  if (text.includes("invitation_not_found")) return new NotFoundError("That invitation is no longer available.");
  if (text.includes("member_not_found")) return new NotFoundError("That person isn't in the group.");
  if (text.includes("profile_not_found")) return new NotFoundError("Profile not found");
  if (text.includes("not_allowed")) return new ForbiddenError("Only the group's owner or an admin can do that.");
  if (text.includes("already_member")) return new ConflictError("That person is already in the group.");
  if (text.includes("already_invited")) return new DomainError("They were invited in the last 12 hours. Give it a little time before inviting them again.", 409, "already_invited");
  if (text.includes("invite_limit_reached")) return new DomainError("You've sent a lot of invitations today. Try again tomorrow.", 429, "invite_limit_reached");
  if (text.includes("invalid_email")) return new DomainError("Enter a valid email address.", 400, "invalid_email");
  if (text.includes("owner_cannot_leave")) return new DomainError("You own this group, so you can't leave while others are in it.", 409, "owner_cannot_leave");
  if (text.includes("cannot_remove_owner")) return new DomainError("The owner can't be removed.", 409, "cannot_remove_owner");
  if (text.includes("use_leave")) return new DomainError("Use Leave group to take yourself out.", 400, "use_leave");
  if (text.includes("not_settled")) return new DomainError("Settle up first: someone who owes money, is owed money or has a payment waiting for review can't leave or be removed.", 409, "not_settled");
  if (text.includes("invalid_group_name")) return new DomainError("A group name needs 2 to 80 characters.", 400, "invalid_group_name");
  return new DomainError(text, 400, "database_error");
}
