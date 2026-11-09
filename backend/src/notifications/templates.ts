import type { BadgeTone } from "./brand.js";
import { cleanText, firstName, formatEmailDate, formatMoney, formatShortEmailDate } from "./format.js";
import { renderEmailHtml, renderEmailText, type DetailRow, type EmailModel } from "./layout.js";
import { netPosition, parseStatement, remainingOf, type StatementData, type StatementEntry } from "./statement.js";

export type EmailTone = "friendly" | "cheeky" | "chaos" | "quiet";

export type NotificationInput = {
  eventType: string;
  recipientName: string;
  /** Shown in the footer ("You're getting this at ...") when known. */
  recipientEmail?: string;
  groupName: string;
  tone: EmailTone;
  /**
   * The outbox payload (see the notification_outbox inserts in supabase/migrations). Read today:
   * url (group_invite), amountMinor + currency, eventName (expense_added), settlementId (payment_*).
   * Also shown when a producer adds them: actorName (who invited / added / paid / reviewed),
   * eventDate (YYYY-MM-DD), note (expense or payer note; never shown for payment_needs_attention)
   * and expiresAt (invite expiry). person_invite reads personName (greeting, "You're tracked as"), inviterName
   * and downloadUrl (https only; without it the email has no button). Anything else, including proof or receipt
   * paths, is ignored.
   *
   * person_statement, person_entry and person_reminder go to a saved person (no account) and read a snapshot the
   * database took when it queued them: ownerName, personName, ownerEmail (reply-to), entries, totals, entryCount,
   * openCount, generatedAt, plus newEntries (entry) and frequency (reminder). See ./statement.ts.
   */
  payload: Record<string, unknown>;
};

export type RenderOptions = {
  /** Header logo: "cid:..." for the worker's inline attachment, or a hosted https URL. */
  logoSrc?: string;
  /** Origin that replaces lenadena:// in links, e.g. "https://app.example.com" once the web app hosts the same routes. */
  linkBaseUrl?: string;
};

export type RenderedEmail = { subject: string; text: string; html: string };

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

/** Disputes stay neutral in every tone: no humour, no private reply text in email. */
const NEUTRAL_ATTENTION = "The recipient could not confirm this payment. Open LenaDena to review the private reply.";
const GENERIC_UPDATE = "There is an update in your group ledger.";
const SAFETY_NOTE = "LenaDena never moves money and never asks for bank details, card numbers or passwords by email. Receipts and payment proof stay in the app.";
const TONE_NOTE = "You can change the tone of these emails in LenaDena Settings.";

// Defaults app_claim_notifications() fills in when the profile or group row is missing.
const PLACEHOLDER_NAME = "Friend";
const PLACEHOLDER_GROUP = "your group";

const APP_SCHEME = "lenadena://";

type Context = {
  /** The real group name, or undefined when only the SQL placeholder is known. */
  group?: string;
  groupLabel: string;
  greetingName?: string;
  recipientEmail?: string;
  amount?: string;
  actor?: string;
  eventName?: string;
  eventDate?: string;
  note?: string;
  expiresAt?: string;
  settlementId?: string;
  inviteUrl?: string;
  /** person_invite: the name the inviter saved them under, who invited them, and the https app download link. */
  personName?: string;
  inviter?: string;
  downloadUrl?: string;
  /** person_statement / person_entry / person_reminder: the snapshot, the owner's first name, and what the email is about. */
  statement?: StatementData;
  owner?: string;
  ownerEmail?: string;
  newEntries?: StatementEntry[];
  frequency?: "weekly" | "monthly";
};

/** An app route ("settlement/<id>", "?tab=activity", "" for home) or a URL from the payload. */
type Link = { path: string } | { url: string };

type EventDefinition = {
  subject(context: Context): string;
  preheader(context: Context): string;
  badge: { glyph: string; tone: BadgeTone };
  heading(context: Context): string;
  extra?(context: Context): string[];
  amountLabel?: string;
  /** Replaces the amount highlight (events whose figure is not a single `amountMinor`). */
  highlight?(context: Context): { label: string; value: string } | undefined;
  details(context: Context): Array<DetailRow | undefined>;
  /** Titled row lists under the details card; undefined items are skipped. */
  sections?(context: Context): Array<{ heading: string; rows: DetailRow[] } | undefined>;
  /** Replaces the tone phrase (events whose recipient has no account, so no tone preference). */
  intro?(context: Context): string;
  /** Undefined means no button (and no fallback link). */
  cta(context: Context): { label: string; link: Link } | undefined;
  /** Extra calm notes above the safety note. */
  notes?(context: Context): string[];
  /** Why-you-got-this lines; defaults to membership plus the tone hint. */
  footer?(context: Context): string[];
};

function row(label: string, value: string | undefined, stacked = false): DetailRow | undefined {
  if (!value) return undefined;
  return stacked ? { label, value, stacked } : { label, value };
}

function memberReason(context: Context) {
  const at = context.recipientEmail ? ` at ${context.recipientEmail}` : "";
  return context.group
    ? `You're getting this${at} because you're a member of ${context.group} on LenaDena.`
    : `You're getting this${at} because you have a LenaDena account.`;
}

const LOADLY_HOSTS = new Set(["i.loadly.io", "loadly.io"]);

function hostOf(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}


// --- Emails to a saved person ------------------------------------------------------------------------------------
// The reader is the PERSON, not the account owner, so every direction is flipped: an entry the owner marked
// `incoming` (the person owes the owner) reads "You owe <owner>".

function ownerOf(c: Context) {
  return c.owner ?? "your friend";
}

function positionRows(c: Context): DetailRow[] {
  const owner = ownerOf(c);
  return (c.statement?.totals ?? []).flatMap((total): DetailRow[] => {
    const net = netPosition(total);
    const money = formatMoney(net.amountMinor, total.currency);
    if (net.side === "even" || !money) return [{ label: `${total.currency} balance`, value: "All square" }];
    return [{ label: net.side === "personOwes" ? `You owe ${owner}` : `${owner} owes you`, value: money }];
  });
}

/** The biggest single figure first: the currency with the largest difference leads the email. */
function headlinePosition(c: Context): { label: string; value: string } | undefined {
  const owner = ownerOf(c);
  const ranked = (c.statement?.totals ?? [])
    .map((total) => ({ total, net: netPosition(total) }))
    .filter((item) => item.net.side !== "even")
    .sort((left, right) => right.net.amountMinor - left.net.amountMinor);
  const lead = ranked[0];
  if (!lead) return undefined;
  const value = formatMoney(lead.net.amountMinor, lead.total.currency);
  if (!value) return undefined;
  return { label: lead.net.side === "personOwes" ? `You owe ${owner}` : `${owner} owes you`, value };
}

function entryRow(entry: StatementEntry, owner: string, reference?: string): DetailRow {
  const open = remainingOf(entry);
  const label = `${entry.title} · ${formatShortEmailDate(entry.eventDate, reference) ?? entry.eventDate}`;
  const who = entry.direction === "incoming" ? "You owe" : `${owner} owes`;
  if (open === 0) return { label, value: `Settled · ${formatMoney(entry.amountMinor, entry.currency) ?? ""}`.trim() };
  const left = formatMoney(open, entry.currency) ?? "";
  const partly = entry.paidMinor > 0 ? ` (of ${formatMoney(entry.amountMinor, entry.currency) ?? ""})` : "";
  return { label, value: `${who} ${left}${partly}` };
}

function replyNote(c: Context) {
  return c.ownerEmail ? [`Questions? Just reply to this email: it goes to ${ownerOf(c)}.`] : [];
}

function personFooter(c: Context, what: string) {
  return [
    `You're getting this because ${ownerOf(c)} saved ${c.recipientEmail ?? "your email address"} in their LenaDena people and ${what}. LenaDena only records what two people track; it never moves money. If you don't know them, you can ignore this email.`,
  ];
}

const events = {
  person_entry: {
    subject: (c) => {
      const entries = c.newEntries ?? [];
      return entries.length === 1 && entries[0]
        ? `${ownerOf(c)} added "${entries[0].title}" to your account`
        : `${ownerOf(c)} added ${entries.length || "new"} entries to your account`;
    },
    preheader: (c) => {
      const lead = headlinePosition(c);
      return lead ? `${lead.label}: ${lead.value}. See what changed.` : `${ownerOf(c)} updated what you owe each other.`;
    },
    badge: { glyph: "+", tone: "violet" },
    heading: (c) => ((c.newEntries?.length ?? 0) > 1 ? `${ownerOf(c)} added new entries` : `New entry from ${ownerOf(c)}`),
    intro: (c) => `${ownerOf(c)} added ${(c.newEntries?.length ?? 0) > 1 ? "new entries" : "a new entry"} to what you owe each other on LenaDena. Here is what changed.`,
    extra: () => ["No action needed: this is just so you both see the same figures."],
    highlight: (c) => {
      const only = c.newEntries?.length === 1 ? c.newEntries[0] : undefined;
      const value = only ? formatMoney(only.amountMinor, only.currency) : undefined;
      return only && value ? { label: `${only.title} · ${only.direction === "incoming" ? `You owe ${ownerOf(c)}` : `${ownerOf(c)} owes you`}`, value } : undefined;
    },
    details: (c) => {
      const only = c.newEntries?.length === 1 ? c.newEntries[0] : undefined;
      if (!only) return [];
      return [row("Date", formatEmailDate(only.eventDate)), row("Type", only.kind === "loan" ? "Loan" : "Expense"), row("Note", only.note, true)];
    },
    sections: (c) => [
      (c.newEntries?.length ?? 0) > 1 ? { heading: "What was added", rows: (c.newEntries ?? []).map((entry) => entryRow(entry, ownerOf(c), c.statement?.generatedAt)) } : undefined,
      { heading: "Where things stand", rows: [...positionRows(c), ...(c.statement ? [{ label: "Open entries", value: String(c.statement.openCount) }] : [])] },
    ],
    cta: () => undefined,
    notes: replyNote,
    footer: (c) => personFooter(c, "added an entry with you"),
  },
  person_statement: {
    subject: (c) => `Your statement with ${ownerOf(c)}`,
    preheader: (c) => {
      const lead = headlinePosition(c);
      return lead ? `${lead.label}: ${lead.value}. The complete statement is attached as a PDF.` : `The complete statement with ${ownerOf(c)} is attached as a PDF.`;
    },
    badge: { glyph: "≡", tone: "violet" },
    heading: (c) => `Your statement with ${ownerOf(c)}`,
    intro: (c) => `${ownerOf(c)} sent you the complete account of what you owe each other. Every entry is in the attached PDF, which you can keep or forward.`,
    extra: (c) => (c.statement && c.statement.openCount === 0 ? ["Everything between you is settled."] : []),
    highlight: (c) => headlinePosition(c),
    details: (c) => [
      ...positionRows(c).slice(headlinePosition(c) ? 1 : 0),
      row("Entries in total", c.statement ? String(c.statement.entryCount) : undefined),
      row("Still open", c.statement ? String(c.statement.openCount) : undefined),
      row("As of", formatEmailDate(c.statement?.generatedAt)),
    ],
    sections: (c) => {
      const open = (c.statement?.entries ?? []).filter((entry) => entry.status === "open");
      const shown = (open.length > 0 ? open : c.statement?.entries ?? []).slice(0, 8);
      const total = open.length > 0 ? open.length : c.statement?.entryCount ?? 0;
      return [{ heading: open.length > 0 ? `Still open${total > shown.length ? ` · latest ${shown.length} of ${total}` : ""}` : "Latest entries", rows: shown.map((entry) => entryRow(entry, ownerOf(c), c.statement?.generatedAt)) }];
    },
    cta: () => undefined,
    notes: (c) => ["The PDF is attached to this email.", ...replyNote(c)],
    footer: (c) => personFooter(c, "sent you the full statement"),
  },
  person_reminder: {
    subject: (c) => `Reminder: what's still open with ${ownerOf(c)}`,
    preheader: (c) => {
      const lead = headlinePosition(c);
      return lead ? `${lead.label}: ${lead.value}.` : `A reminder of what's still open with ${ownerOf(c)}.`;
    },
    badge: { glyph: "↻", tone: "gold" },
    heading: () => "A friendly reminder",
    intro: (c) => `${ownerOf(c)} set LenaDena to remind you ${c.frequency === "monthly" ? "every month" : "every week"} of what is still open between you. Already settled it? Let ${ownerOf(c)} know and they'll mark it done.`,
    highlight: (c) => headlinePosition(c),
    details: (c) => positionRows(c).slice(headlinePosition(c) ? 1 : 0),
    sections: (c) => {
      const open = (c.statement?.entries ?? []).filter((entry) => entry.status === "open").slice(0, 10);
      const total = c.statement?.openCount ?? open.length;
      return [{ heading: `Still open${total > open.length ? ` · latest ${open.length} of ${total}` : ""}`, rows: open.map((entry) => entryRow(entry, ownerOf(c), c.statement?.generatedAt)) }];
    },
    cta: () => undefined,
    notes: (c) => [`Only ${ownerOf(c)} can change or stop these reminders.`, ...replyNote(c)],
    footer: (c) => personFooter(c, `chose to send you ${c.frequency === "monthly" ? "monthly" : "weekly"} reminders`),
  },
  person_invite: {
    subject: (c) => `${c.inviter ?? "A friend"} invited you to LenaDena`,
    preheader: (c) => `${c.inviter ?? "A friend"} uses LenaDena to keep track of what you owe each other. It never moves money.`,
    badge: { glyph: "+", tone: "violet" },
    heading: () => "You're invited to LenaDena",
    intro: (c) => `${c.inviter ?? "A friend"} would like you to join them on LenaDena.`,
    extra: (c) => [
      "LenaDena keeps track of what you owe each other — it never moves money. Shared costs, loans and paybacks sit in one clear list you can both see, so nobody has to keep score.",
      c.downloadUrl
        ? "Install the app, sign up with this email address, and you're in."
        : `Ask ${c.inviter ? firstName(c.inviter) : "whoever invited you"} for the app link: LenaDena is in early access and isn't in the app stores yet.`,
    ],
    details: (c) => [row("Invited by", c.inviter), row("You're tracked as", c.personName)],
    cta: (c) => (c.downloadUrl ? { label: "Get LenaDena", link: { url: c.downloadUrl } } : undefined),
    notes: (c) =>
      c.downloadUrl && LOADLY_HOSTS.has(hostOf(c.downloadUrl))
        ? ["LenaDena is in early access: the button opens Loadly, where the Android app is shared until it arrives on Google Play. Your phone may ask you to allow installs from your browser."]
        : [],
    footer: (c) => [
      `You're getting this because ${c.inviter ?? "someone"} saved ${c.recipientEmail ?? "your email address"} in their LenaDena people and asked us to invite you. If you don't know them, you can ignore this email.`,
    ],
  },
  group_invite: {
    subject: (c) => `Join ${c.groupLabel} on LenaDena`,
    preheader: (c) => `${c.actor ?? "A friend"} invited you to ${c.group ?? "a group"} on LenaDena.`,
    badge: { glyph: "+", tone: "violet" },
    heading: (c) => (c.group ? `You're invited to ${c.group}` : "You're invited to a LenaDena group"),
    extra: () => ["LenaDena keeps track of shared costs and who owes whom, so nobody has to keep score. It never moves money."],
    details: (c) => [row("Group", c.group), row("Invited by", c.actor), row("Invite expires", c.expiresAt)],
    cta: (c) => ({
      label: c.group && c.group.length <= 24 ? `Join ${c.group}` : "Join the group",
      link: c.inviteUrl ? { url: c.inviteUrl } : { path: "" },
    }),
    footer: (c) => [`You're getting this because someone invited ${c.recipientEmail ?? "you"} to a group on LenaDena. If you don't know them, you can ignore this email.`],
  },
  expense_added: {
    subject: (c) => `New expense in ${c.groupLabel}`,
    preheader: (c) =>
      c.amount ? (c.eventName ? `Your share of ${c.eventName} is ${c.amount}.` : `Your share is ${c.amount}.`) : `A new shared expense was added to ${c.groupLabel}.`,
    badge: { glyph: "÷", tone: "violet" },
    heading: (c) => (c.group ? `New expense in ${c.group}` : "New shared expense"),
    amountLabel: "Your share",
    details: (c) => [row("Expense", c.eventName), row("Group", c.group), row("Added by", c.actor), row("Date", c.eventDate), row("Note", c.note, true)],
    cta: () => ({ label: "Review expense", link: { path: "?tab=activity" } }),
  },
  debt_reminder: {
    subject: (c) => `Balance reminder for ${c.groupLabel}`,
    preheader: (c) => (c.amount ? `You have ${c.amount} open in ${c.groupLabel}.` : `A balance in ${c.groupLabel} is still open.`),
    badge: { glyph: "↻", tone: "gold" },
    heading: (c) => (c.group ? `Your balance in ${c.group}` : "Your open balance"),
    extra: () => ["Already paid? Mark it as paid in LenaDena so it can be confirmed."],
    amountLabel: "Open balance",
    details: (c) => [row("Group", c.group)],
    cta: () => ({ label: "Open balance", link: { path: "?tab=plan" } }),
    footer: (c) => [memberReason(c), "Choose the Quiet email tone in LenaDena Settings to stop balance reminders."],
  },
  payment_claimed: {
    subject: () => "Payment waiting for your review",
    preheader: (c) => `${c.actor ?? "A friend"} marked ${c.amount ?? "a payment"} to you as paid. Check it arrived, then confirm.`,
    badge: { glyph: "→", tone: "violet" },
    heading: () => "Payment waiting for your review",
    extra: () => ["Only confirm it once you can see the money in your account."],
    amountLabel: "Amount",
    details: (c) => [row("From", c.actor), row("Group", c.group), row("Status", "Waiting for you"), row("Note", c.note, true)],
    cta: (c) => ({ label: "Review payment", link: { path: c.settlementId ? `settlement/${encodeURIComponent(c.settlementId)}` : "?tab=reviews" } }),
  },
  payment_confirmed: {
    subject: () => "Payment confirmed",
    preheader: (c) => `${c.amount ?? "Your payment"} is confirmed. Your balance is up to date.`,
    badge: { glyph: "✓", tone: "mint" },
    heading: () => "Payment confirmed",
    amountLabel: "Amount",
    details: (c) => [row("Confirmed by", c.actor), row("Group", c.group), row("Status", "Confirmed")],
    cta: () => ({ label: "View activity", link: { path: "?tab=activity" } }),
  },
  payment_self_confirmed: {
    subject: () => "Payment marked settled by payer",
    preheader: (c) => `${c.amount ?? "A payment"} was marked settled by the payer without your confirmation.`,
    badge: { glyph: "✓", tone: "gold" },
    heading: () => "Payment marked as settled",
    amountLabel: "Amount",
    details: (c) => [row("Marked settled by", c.actor), row("Group", c.group), row("Status", "Settled by the payer")],
    cta: () => ({ label: "View activity", link: { path: "?tab=activity" } }),
  },
  payment_needs_attention: {
    subject: () => "Payment needs attention",
    preheader: () => "The recipient could not confirm your payment yet. Open LenaDena to see their reply.",
    badge: { glyph: "!", tone: "coral" },
    heading: () => "A payment needs attention",
    amountLabel: "Amount",
    details: (c) => [row("Reviewed by", c.actor), row("Group", c.group), row("Status", "Needs attention")],
    cta: () => ({ label: "Review payment", link: { path: "?tab=activity" } }),
  },
} satisfies Record<string, EventDefinition>;

const fallbackEvent: EventDefinition = {
  subject: (c) => `Update from ${c.groupLabel}`,
  preheader: (c) => `There's an update in ${c.groupLabel} on LenaDena.`,
  badge: { glyph: "•", tone: "violet" },
  heading: (c) => (c.group ? `There's an update in ${c.group}` : "There's an update in LenaDena"),
  details: (c) => [row("Group", c.group)],
  cta: () => ({ label: "Open LenaDena", link: { path: "" } }),
};

export const notificationEventTypes = Object.keys(events) as Array<keyof typeof events>;
export const emailTones = Object.keys(phrases) as EmailTone[];

function tonePhrase(tone: string, eventType: string) {
  if (eventType === "payment_needs_attention") return NEUTRAL_ATTENTION;
  const set = Object.hasOwn(phrases, tone) ? phrases[tone as EmailTone] : phrases.friendly;
  return Object.hasOwn(set, eventType) ? set[eventType as keyof typeof set] : GENERIC_UPDATE;
}

function appLink(path: string, base?: string) {
  return base ? `${base}/${path}` : `${APP_SCHEME}${path}`;
}

function resolveLink(link: Link, base?: string) {
  if ("path" in link) return appLink(link.path, base);
  const url = link.url.trim();
  if (url.startsWith(APP_SCHEME)) return appLink(url.slice(APP_SCHEME.length), base);
  if (/^https?:\/\/[^\s"'<>]+$/i.test(url)) return url;
  // Anything else (javascript:, data:, relative paths) never reaches a button.
  return appLink("", base);
}

function normalizeBase(value?: string) {
  const trimmed = value?.trim().replace(/\/+$/, "");
  return trimmed && /^https?:\/\/[^\s"'<>]+$/i.test(trimmed) ? trimmed : undefined;
}

function buildContext(input: NotificationInput): Context {
  const payload = input.payload ?? {};
  const groupName = cleanText(input.groupName, 80);
  const group = groupName && groupName.toLowerCase() !== PLACEHOLDER_GROUP ? groupName : undefined;
  const recipientName = cleanText(input.recipientName, 80);
  // An invited person has no account yet (the worker says "Friend"), so greet them by the name they were saved under.
  const invitedName = input.eventType.startsWith("person_") ? cleanText(payload.personName, 80) : undefined;
  const greetingName = recipientName && recipientName !== PLACEHOLDER_NAME ? firstName(recipientName) : invitedName ? firstName(invitedName) : undefined;
  const values: Array<[Exclude<keyof Context, "statement" | "newEntries" | "frequency">, string | undefined]> = [
    ["group", group],
    ["greetingName", greetingName],
    ["recipientEmail", cleanText(input.recipientEmail, 254)],
    ["amount", formatMoney(payload.amountMinor, payload.currency)],
    ["actor", cleanText(payload.actorName, 80)],
    ["eventName", cleanText(payload.eventName, 120)],
    ["eventDate", formatEmailDate(payload.eventDate)],
    ["note", input.eventType === "payment_needs_attention" ? undefined : cleanText(payload.note, 300)],
    ["expiresAt", formatEmailDate(payload.expiresAt)],
    ["settlementId", cleanText(payload.settlementId, 64)],
    // Links are never shortened: an over-long or non-string url is dropped and the button opens the app.
    ["inviteUrl", typeof payload.url === "string" && payload.url.length <= 2000 ? payload.url.trim() : undefined],
    ["personName", cleanText(payload.personName, 80)],
    ["inviter", cleanText(payload.inviterName, 80)],
    // Only a plain https link goes behind the "Get LenaDena" button; anything else means no button at all.
    ["downloadUrl", typeof payload.downloadUrl === "string" && payload.downloadUrl.length <= 2000 && /^https:\/\/[^\s"'<>]+$/i.test(payload.downloadUrl.trim()) ? payload.downloadUrl.trim() : undefined],
  ];
  const context: Context = { groupLabel: group ?? PLACEHOLDER_GROUP };
  for (const [key, value] of values) if (value) context[key] = value;
  if (input.eventType === "person_statement" || input.eventType === "person_entry" || input.eventType === "person_reminder") {
    const statement = parseStatement(payload);
    context.statement = statement;
    context.owner = firstName(statement.ownerName) || "your friend";
    const ownerEmail = cleanText(payload.ownerEmail, 254);
    if (ownerEmail && /^[^\s@]+@[^\s@]+$/.test(ownerEmail)) context.ownerEmail = ownerEmail;
    if (input.eventType === "person_entry") context.newEntries = parseStatement({ entries: payload.newEntries }).entries;
    if (input.eventType === "person_reminder") context.frequency = payload.frequency === "monthly" ? "monthly" : "weekly";
  }
  return context;
}

function isKnownEvent(eventType: string): eventType is keyof typeof events {
  return Object.hasOwn(events, eventType);
}

/** Builds the full content of one notification, before layout. Exported for previews and tests. */
export function buildNotificationModel(input: NotificationInput, options: RenderOptions = {}): { subject: string; model: EmailModel } {
  const definition: EventDefinition = isKnownEvent(input.eventType) ? events[input.eventType] : fallbackEvent;
  const context = buildContext(input);
  const subject = cleanText(definition.subject(context), 150) ?? "Update from LenaDena";
  const cta = definition.cta(context);
  const url = cta ? resolveLink(cta.link, normalizeBase(options.linkBaseUrl)) : undefined;
  const webLink = url ? /^https?:/i.test(url) : false;
  const details = definition.details(context).filter((item): item is DetailRow => item !== undefined);
  const sections = (definition.sections?.(context) ?? []).filter((item): item is { heading: string; rows: DetailRow[] } => item !== undefined && item.rows.length > 0);
  const model: EmailModel = {
    title: subject,
    preheader: definition.preheader(context),
    badge: definition.badge,
    heading: definition.heading(context),
    paragraphs: [`Hi ${context.greetingName ?? "there"},`, definition.intro?.(context) ?? tonePhrase(input.tone, input.eventType), ...(definition.extra?.(context) ?? [])],
    ...(definition.highlight
      ? (() => {
          const value = definition.highlight(context);
          return value ? { highlight: value } : {};
        })()
      : context.amount && definition.amountLabel ? { highlight: { label: definition.amountLabel, value: context.amount } } : {}),
    details,
    ...(sections.length > 0 ? { sections } : {}),
    ...(cta && url
      ? {
          cta: { label: cta.label, url },
          fallback: {
            lead: webLink ? "Button not working? Paste this link into your browser:" : "Button not working? Open this link on the phone where LenaDena is installed:",
            url,
          },
        }
      : {}),
    notes: [...(definition.notes?.(context) ?? []), SAFETY_NOTE],
    footer: definition.footer?.(context) ?? [memberReason(context), TONE_NOTE],
    ...(options.logoSrc ? { logoSrc: options.logoSrc } : {}),
  };
  return { subject, model };
}

export function renderNotification(input: NotificationInput, options: RenderOptions = {}): RenderedEmail {
  const { subject, model } = buildNotificationModel(input, options);
  return { subject, text: renderEmailText(model), html: renderEmailHtml(model) };
}
