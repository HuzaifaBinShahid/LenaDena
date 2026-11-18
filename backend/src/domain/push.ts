import { DomainError, NotFoundError } from "./errors.js";

/**
 * Push notifications (Firebase Cloud Messaging): the device tokens people choose to register, reminders to someone who
 * owes you in a group, and the push for an invitation. The rules live in
 * supabase/migrations/202611170016_push_notifications.sql; this turns what it raises into clear API errors.
 */

export type PushPlatform = "android" | "ios" | "web";

/** What app_create_nudge returns: everything needed to send one reminder. `nudgeId` is null when no device was found. */
export type NudgeDelivery = {
  nudgeId: string | null;
  senderName: string;
  recipientName: string;
  amountMinor: number;
  currency: string;
  groupId: string;
  groupName: string;
  tokens: string[];
};

/** Who to push after an invitation went to an address, when that address belongs to an account with a device. */
export type InvitationPushTarget = { tokens: string[]; inviterName: string; groupName: string; groupId: string };

/**
 * The four moments of a payment that someone else hears about:
 *   claimed          the payer says they paid: the recipient is asked to confirm
 *   confirmed        the recipient confirmed: the payer hears it is settled
 *   needs_attention  the recipient says something is wrong: the payer is asked to look
 *   self_confirmed   the payer marked it settled after the review window: the recipient is told
 */
export type PaymentPushEvent = "claimed" | "confirmed" | "needs_attention" | "self_confirmed";

/**
 * Who to push after a payment step the caller just took, from `app_get_payment_push_target`. `actorName` is the
 * person who took the step (the one the notification is about), not the one receiving it.
 */
export type PaymentPushTarget = {
  tokens: string[];
  event: PaymentPushEvent;
  actorName: string;
  amountMinor: number;
  currency: string;
  groupId: string;
  groupName: string;
  settlementId: string;
};

/** What the health function reports: the database answered, and which features' functions it lacks. */
export type DatabaseHealth = {
  /** Names of features whose migration is not applied yet. Null when the health function itself is not installed. */
  missing: string[] | null;
};

/**
 * What the app is told after asking for a reminder.
 *   sent         at least one device got it
 *   no_device    the person has no device registered (or only dead ones), so the app offers to share a message instead
 *   failed       Firebase could not deliver it; nothing was recorded, so trying again later is fine
 *   unavailable  this server has no Firebase credentials, so the app offers to share a message instead
 */
export type NudgeStatus = "sent" | "no_device" | "failed" | "unavailable";

/** The database does not have the push functions yet. */
export class PushUnavailableError extends DomainError {
  constructor() {
    super("Notifications aren't switched on yet. Try again after the next update.", 503, "push_unavailable");
  }
}

/** What the push functions raise, as the API's own errors. */
export function toPushError(text: string): DomainError {
  if (text.includes("group_not_found") || text.includes("group membership required")) return new NotFoundError("Group not found");
  if (text.includes("member_not_found")) return new NotFoundError("That person isn't in the group.");
  if (text.includes("profile_not_found")) return new NotFoundError("Profile not found");
  if (text.includes("cannot_nudge_yourself")) return new DomainError("You can't remind yourself.", 400, "cannot_nudge_yourself");
  if (text.includes("nothing_owed")) return new DomainError("They don't owe you anything in this group right now.", 409, "nothing_owed");
  if (text.includes("nudge_cooldown")) return new DomainError("You already reminded them today. Give it until tomorrow.", 429, "nudge_cooldown");
  if (text.includes("nudge_limit_reached")) return new DomainError("You've sent a lot of reminders today. Try again tomorrow.", 429, "nudge_limit_reached");
  if (text.includes("invalid_platform")) return new DomainError("Unknown device type.", 400, "invalid_platform");
  if (text.includes("invalid_token")) return new DomainError("That device token isn't valid.", 400, "invalid_token");
  return new DomainError(text, 400, "database_error");
}
