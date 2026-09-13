type EmailTone = "friendly" | "cheeky" | "chaos" | "quiet";

export type NotificationInput = {
  eventType: string;
  recipientName: string;
  groupName: string;
  tone: EmailTone;
  payload: Record<string, unknown>;
};

const phrases = {
  friendly: {
    expense_added: "A new shared expense is ready for your review.",
    debt_reminder: "A small balance is still waiting when you are ready.",
    payment_claimed: "A friend marked their payment as sent. Please check that it arrived.",
    payment_confirmed: "Payment confirmed. The group ledger is smiling again.",
    payment_self_confirmed: "The payer marked this payment settled because recipient confirmation was unavailable. You can review the group record in LenaDena.",
    group_invite: "Your people saved you a seat.",
  },
  cheeky: {
    expense_added: "The receipt has entered the group chat.",
    debt_reminder: "Your wallet has been tagged. Politely, for now.",
    payment_claimed: "Someone says the money has landed. Time for the trusted eyeball check.",
    payment_confirmed: "Balance closed. Friendship survives another transaction.",
    payment_self_confirmed: "The payer closed this one with the fallback option. The audit trail is waiting in LenaDena.",
    group_invite: "You have been financially summoned by friends.",
  },
  chaos: {
    expense_added: "BREAKING: a receipt has chosen violence.",
    debt_reminder: "The balance remains undefeated. Your move, legend.",
    payment_claimed: "MONEY MAY HAVE MOVED. Confirm the plot twist.",
    payment_confirmed: "DEBT DEFEATED. Group harmony restored.",
    payment_self_confirmed: "FALLBACK SETTLEMENT USED. The payer closed the balance and the record is saved.",
    group_invite: "THE GROUP LEDGER DEMANDS YOUR PRESENCE.",
  },
  quiet: {
    expense_added: "A shared expense was added.",
    debt_reminder: "A balance is outstanding.",
    payment_claimed: "A payment is awaiting confirmation.",
    payment_confirmed: "A payment was confirmed.",
    payment_self_confirmed: "The payer marked a payment as settled without recipient confirmation.",
    group_invite: "You were invited to a group.",
  },
} as const;

function text(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

export function renderNotification(input: NotificationInput) {
  const safeTone = input.tone in phrases ? input.tone : "friendly";
  const neutralEvent = input.eventType === "payment_needs_attention";
  const phrase = neutralEvent
    ? "The recipient could not confirm this payment. Open LenaDena to review the private reply."
    : phrases[safeTone][input.eventType as keyof (typeof phrases)[typeof safeTone]] ?? "There is an update in your group ledger.";
  const subjects: Record<string, string> = {
    group_invite: `Join ${input.groupName} on LenaDena`,
    expense_added: `New expense in ${input.groupName}`,
    debt_reminder: `Balance reminder for ${input.groupName}`,
    payment_claimed: `Payment waiting for your review`,
    payment_confirmed: `Payment confirmed`,
    payment_self_confirmed: `Payment marked settled by payer`,
    payment_needs_attention: `Payment needs attention`,
  };
  const url = text(input.payload.url) || "lenadena://";
  const amount = text(input.payload.amountMinor);
  const amountLine = amount ? `<p style="margin:0 0 18px;color:#627084">Amount: ${escapeHtml(amount)} minor units</p>` : "";
  const html = `<div style="background:#F7F1E8;padding:28px;font-family:Arial,sans-serif;color:#17212B"><div style="max-width:560px;margin:auto;background:#FFFDFC;border:1px solid #D9DDE1;border-radius:24px;padding:28px"><div style="font-size:22px;font-weight:800;margin-bottom:24px">LenaDena</div><h1 style="font-size:26px;line-height:1.2;margin:0 0 14px">Hi ${escapeHtml(input.recipientName)},</h1><p style="font-size:16px;line-height:1.6;margin:0 0 18px">${escapeHtml(phrase)}</p>${amountLine}<a href="${escapeHtml(url)}" style="display:inline-block;background:#35C4A5;color:#17212B;text-decoration:none;font-weight:800;padding:14px 20px;border-radius:14px">Open LenaDena</a><p style="font-size:12px;line-height:1.5;color:#627084;margin:24px 0 0">Receipts and payment proof are never included in email. Manage tone and reminders in the app.</p></div></div>`;
  return { subject: subjects[input.eventType] ?? `Update from ${input.groupName}`, text: `${phrase}\n\nOpen LenaDena: ${url}`, html };
}
