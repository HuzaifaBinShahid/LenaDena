import { firstName, formatMoney as formatAppMoney } from "../../lib/format";
import type { GroupPerson } from "../ledger/types";

/**
 * The pure parts of push notifications (Vitest runs this, so no react-native): who can be reminded, what the app says
 * after asking, the message shared when a notification cannot be sent, and where a tapped notification goes. The
 * server is the authority on the rules: it refuses anything these let through. Mirrors
 * supabase/migrations/202611170016_push_notifications.sql and backend/src/push.
 */

/** The Android channel the app creates; the server names the same one in every message. */
export const PUSH_CHANNEL_ID = "reminders";

/** What the server answers to "remind them" (see backend/src/domain/push.ts). */
export type NudgeStatus = "sent" | "no_device" | "failed" | "unavailable";

/**
 * Pushes are offered on Android builds that were made with a Firebase `google-services.json` (app.config.ts then sets
 * `extra.pushEnabled`). iOS would need Apple's push service set up in Firebase as well, so it is not offered yet.
 */
export function pushSupported(input: { platform: string; enabledInBuild: unknown }): boolean {
  return input.platform === "android" && input.enabledInBuild === true;
}

/** "Remind" shows for someone who owes the viewer money here. Never for yourself or someone who is square or owed. */
export function canRemind(viewerId: string, member: Pick<GroupPerson, "id" | "owesYouMinor">): boolean {
  return member.id !== viewerId && member.owesYouMinor > 0;
}

/** The app's amount ("Rs 1,850") with a normal space: the no-break space inside it pastes oddly into other apps. */
function money(minor: number, currency: string): string {
  return formatAppMoney(minor, currency).replace(/ /g, " ");
}

/** What to say after the server answered. `share` means: offer the same words through the share sheet instead. */
export type RemindOutcome = { kind: "sent" | "share"; title: string; message: string };

export function remindOutcome(status: NudgeStatus, memberName: string): RemindOutcome {
  const name = firstName(memberName) || "They";
  switch (status) {
    case "sent":
      return { kind: "sent", title: "Reminder sent", message: `${name} got a notification on their phone.` };
    case "no_device":
      return { kind: "share", title: `${name} isn't getting notifications`, message: "They haven't switched on reminders in the app, so choose how to send it yourself." };
    case "failed":
      return { kind: "share", title: "Couldn't send the notification", message: "Nothing was sent and it doesn't count for today. You can send it yourself instead." };
    case "unavailable":
      return { kind: "share", title: "Notifications aren't switched on yet", message: "You can send your reminder yourself instead." };
  }
}

/** The words shared when a notification can't be sent, in the owner's voice (like the entry and statement messages). */
export function reminderShareMessage(input: { memberName: string; amountMinor: number; currency: string; groupName: string }): string {
  const who = firstName(input.memberName);
  return [
    who ? `Hi ${who} 👋 A friendly reminder from LenaDena:` : "A friendly reminder from LenaDena:",
    "",
    `💰 You owe me *${money(input.amountMinor, input.currency)}* in *${input.groupName}*.`,
    "",
    "When you can, please settle up. Thank you!",
    "",
    "━━━━━━━━━━━━━━",
    "Shared from LenaDena · give & take, kept clear",
  ].join("\n");
}

export type NotificationTarget = { kind: "group"; groupId: string } | { kind: "invitations" };

/** A group id is a UUID or a short slug (demo data): letters, digits and hyphens only, so it can never steer to another route. */
const GROUP_ID = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;

/** Where a tapped notification goes, from the `data` the server sent. Anything unexpected goes nowhere. */
export function targetForNotification(data: unknown): NotificationTarget | null {
  if (!data || typeof data !== "object") return null;
  const { type, groupId } = data as { type?: unknown; groupId?: unknown };
  if (type === "group_invite") return { kind: "invitations" };
  if (type === "nudge" && typeof groupId === "string" && GROUP_ID.test(groupId)) return { kind: "group", groupId };
  return null;
}
