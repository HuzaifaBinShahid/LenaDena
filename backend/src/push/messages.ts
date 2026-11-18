import type { InvitationPushTarget, NudgeDelivery, PaymentPushTarget } from "../domain/push.js";
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

/**
 * The four payment moments (see PaymentPushEvent). Each is about what another person just did, so it names them and
 * the amount and group, like a reminder does. The data carries the event and the group so a tap opens the right place.
 */
export function paymentMessage(target: Pick<PaymentPushTarget, "event" | "actorName" | "amountMinor" | "currency" | "groupId" | "groupName" | "settlementId">): PushMessage {
  const who = cleanText(firstName(target.actorName), 40) ?? "A friend";
  const group = cleanText(target.groupName, 80) ?? "your group";
  const amount = formatMoney(target.amountMinor, target.currency);
  const detail = amount ? `${amount} in ${group}` : group;
  const words = {
    claimed: { title: `${who} says they paid you`, body: `${detail}. Tap to confirm it.` },
    confirmed: { title: `${who} confirmed your payment`, body: `${detail} is settled.` },
    needs_attention: { title: `${who} says your payment needs a look`, body: `${detail}. Tap to open the group.` },
    self_confirmed: { title: `${who} marked a payment as settled`, body: `${detail}. Open the group to check it.` },
  }[target.event];
  return {
    ...words,
    data: { type: `payment_${target.event}`, groupId: target.groupId, settlementId: target.settlementId },
    channelId: PUSH_CHANNEL,
  };
}
