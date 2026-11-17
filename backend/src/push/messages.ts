import type { InvitationPushTarget, NudgeDelivery } from "../domain/push.js";
import { cleanText, firstName, formatMoney } from "../notifications/format.js";
import type { PushMessage } from "./fcm.js";

/** The channel the app creates on Android; its id is also in frontend/src/features/push. */
export const PUSH_CHANNEL = "reminders";

/** "Sara is asking for money back": friendly, short, never more than the person needs to act. Names come from profiles, so they are cleaned. */
export function nudgeMessage(delivery: Pick<NudgeDelivery, "senderName" | "amountMinor" | "currency" | "groupId" | "groupName">): PushMessage {
  const sender = cleanText(firstName(delivery.senderName), 40) ?? "A friend";
  const group = cleanText(delivery.groupName, 80) ?? "your group";
  const amount = formatMoney(delivery.amountMinor, delivery.currency);
  return {
    title: `${sender} sent you a reminder`,
    body: amount ? `You owe ${sender} ${amount} in ${group}. Tap to settle up.` : `You have something to settle with ${sender} in ${group}. Tap to open it.`,
    data: { type: "nudge", groupId: delivery.groupId },
    channelId: PUSH_CHANNEL,
  };
}

export function invitationMessage(target: Pick<InvitationPushTarget, "inviterName" | "groupName" | "groupId">): PushMessage {
  const inviter = cleanText(firstName(target.inviterName), 40) ?? "A friend";
  const group = cleanText(target.groupName, 80) ?? "a group";
  return {
    title: `${inviter} invited you to ${group}`,
    body: "Open LenaDena to accept or decline.",
    data: { type: "group_invite", groupId: target.groupId },
    channelId: PUSH_CHANNEL,
  };
}
