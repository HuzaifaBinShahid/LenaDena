// The messages the share sheet sends for one entry or a whole account with a person. Pure (Vitest runs it): no
// react-native. Written in the account owner's voice, speaking to the other person ("You owe me", "I owe you"), and
// formatted for WhatsApp (*bold*, emoji, short sections) while staying readable as plain text in email or SMS.
import { firstName, formatMoney as formatAppMoney } from "../../lib/format";
import { remainingAmountOf, settledAmountOf } from "../ledger/amounts";
import type { Person, TransactionItem } from "../ledger/types";
import { summarizePerson } from "../people/people";

/** The app's amount ("Rs 1,850") with a normal space: the no-break space inside it pastes oddly into other apps. */
function formatMoney(minor: number, currency: string): string {
  return formatAppMoney(minor, currency).replace(/\u00a0/g, " ");
}

const RULE = "━━━━━━━━━━━━━━";
const SIGNATURE = "Shared from LenaDena · give & take, kept clear";
/** A statement lists at most this many open entries, then settled ones; the rest is summarised, not dropped silently. */
const MAX_OPEN_LINES = 20;
const MAX_SETTLED_LINES = 8;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** Day, month and year of a YYYY-MM-DD date, or of a timestamp in the phone's own time zone. Undefined when it does not parse. */
function dayParts(value: string): { day: number; month: number; year: number } | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return { year: date.getFullYear(), month: date.getMonth(), day: date.getDate() };
}

/**
 * "13 Sep 2026", with a fixed English month table: Intl abbreviates September as "Sep" or "Sept" depending on the
 * phone, and a message should read the same wherever it is opened.
 */
export function shareDate(value: string): string {
  const parts = dayParts(value);
  return parts && MONTHS[parts.month] ? `${parts.day} ${MONTHS[parts.month]} ${parts.year}` : value;
}

/** "13 Sep", for lines where the year is obvious from the heading. */
function shortDay(value: string): string {
  const parts = dayParts(value);
  return parts && MONTHS[parts.month] ? `${parts.day} ${MONTHS[parts.month]}` : value;
}

/** Who owes whom on one entry, in the owner's voice. `incoming` means the other person owes the owner. */
function whoOwes(entry: Pick<TransactionItem, "direction">, amount: string): string {
  return entry.direction === "incoming" ? `You owe me *${amount}*` : `I owe you *${amount}*`;
}

function plain(entry: Pick<TransactionItem, "direction">, amount: string): string {
  return entry.direction === "incoming" ? `You owe me ${amount}` : `I owe you ${amount}`;
}

export type EntryShareInput = {
  entry: TransactionItem;
  /** Who the message is for; the entry's counterparty when omitted. */
  personName?: string | undefined;
};

/** Titles the share sheet (the subject line on email targets). */
export function entryShareTitle({ entry, personName }: EntryShareInput): string {
  const who = firstName(personName ?? entry.counterparty ?? "");
  return who ? `${entry.title} · ${formatMoney(entry.amountMinor, entry.currency)} with ${who}` : `${entry.title} · ${formatMoney(entry.amountMinor, entry.currency)}`;
}

/**
 * One entry, e.g.
 *
 *   Hi Ali 👋 Here's the note for *Coffee money*:
 *
 *   🧾 *Coffee money*
 *   13 Sep 2026 · Expense
 *
 *   💰 Amount: *Rs 1,850*
 *   ✅ Paid so far: Rs 500          (only once something has been paid)
 *   ⏳ Still open: *Rs 1,350*
 *
 *   👉 I owe you *Rs 1,350*
 *
 *   ━━━━━━━━━━━━━━
 *   Shared from LenaDena · give & take, kept clear
 */
export function buildEntryShareMessage({ entry, personName }: EntryShareInput): string {
  const who = firstName(personName ?? entry.counterparty ?? "");
  const total = formatMoney(entry.amountMinor, entry.currency);
  const paid = settledAmountOf(entry);
  const remaining = remainingAmountOf(entry);
  const open = entry.status !== "settled" && remaining > 0;
  const kind = entry.kind === "loan" ? "Loan" : "Expense";

  const lines: string[] = [
    who ? `Hi ${who} 👋 Here's the note for *${entry.title}*:` : `Here's the note for *${entry.title}*:`,
    "",
    `🧾 *${entry.title}*`,
    `${shareDate(entry.eventDate)} · ${kind}`,
    "",
    `💰 Amount: *${total}*`,
  ];
  if (open) {
    // The amount line already is what is open until something has been paid.
    if (paid > 0) lines.push(`✅ Paid so far: ${formatMoney(paid, entry.currency)}`, `⏳ Still open: *${formatMoney(remaining, entry.currency)}*`);
    lines.push("", `👉 ${whoOwes(entry, formatMoney(remaining, entry.currency))}`);
  } else {
    lines.push("✅ Settled in full", "", "🎉 All square on this one. Thank you!");
  }
  const note = entry.note?.trim();
  if (note) lines.push("", `📝 ${note}`);
  lines.push("", RULE, SIGNATURE);
  return lines.join("\n");
}

export type StatementShareInput = {
  person: Pick<Person, "id" | "name"> & Partial<Person>;
  /** Every entry with them (open and settled), in any order. */
  entries: readonly TransactionItem[];
  /** The account owner's name, for the "Huzaifa ⇄ Ali" line. */
  ownerName?: string | undefined;
  /** The "as of" date; today when omitted. */
  now?: Date | undefined;
};

function asOf(now: Date | undefined): string {
  return shareDate((now ?? new Date()).toISOString());
}

export function statementShareTitle({ person, now }: Pick<StatementShareInput, "person" | "now">): string {
  return `Statement with ${firstName(person.name) || person.name} · ${asOf(now)}`;
}

/**
 * The whole account with one person: where you stand per currency, every open entry, then what is settled.
 *
 *   📒 *Statement with Ali*
 *   Huzaifa ⇄ Ali · as of 10 Nov 2026
 *
 *   *Where we stand*
 *   👉 You owe me *Rs 1,350*
 *
 *   *Open entries* (2)
 *   • Camera rental · 8 Nov: You owe me Rs 4,500
 *   • Coffee money · 13 Sep: I owe you Rs 1,350
 *
 *   *Settled* (1)
 *   ✔️ Camera loan · 8 Sep: Rs 12,000
 */
export function buildStatementShareMessage({ person, entries, ownerName, now }: StatementShareInput): string {
  const them = firstName(person.name) || person.name;
  const me = firstName(ownerName ?? "");
  const sorted = [...entries].sort((left, right) => right.eventDate.localeCompare(left.eventDate) || right.createdAt.localeCompare(left.createdAt));
  const open = sorted.filter((entry) => entry.status !== "settled" && remainingAmountOf(entry) > 0);
  const settled = sorted.filter((entry) => !open.includes(entry));
  const summary = summarizePerson({ id: person.id, name: person.name, createdAt: person.createdAt ?? "" }, entries);

  const lines: string[] = [`📒 *Statement with ${them}*`, `${me ? `${me} ⇄ ${them}` : `You ⇄ ${them}`} · as of ${asOf(now)}`, "", "*Where we stand*"];
  const standing = summary.balances.filter((balance) => balance.netMinor !== 0);
  if (standing.length === 0) {
    lines.push(entries.length === 0 ? "Nothing tracked yet." : "✅ All square. Nothing is open.");
  } else {
    for (const balance of standing) {
      const amount = formatMoney(Math.abs(balance.netMinor), balance.currency);
      lines.push(balance.netMinor > 0 ? `👉 You owe me *${amount}*` : `👉 I owe you *${amount}*`);
    }
  }

  if (open.length > 0) {
    lines.push("", `*Open entries* (${open.length})`);
    for (const entry of open.slice(0, MAX_OPEN_LINES)) {
      const left = formatMoney(remainingAmountOf(entry), entry.currency);
      const partly = settledAmountOf(entry) > 0 ? ` (of ${formatMoney(entry.amountMinor, entry.currency)})` : "";
      lines.push(`• ${entry.title} · ${shortDay(entry.eventDate)}: ${plain(entry, left)}${partly}`);
    }
    if (open.length > MAX_OPEN_LINES) lines.push(`…and ${open.length - MAX_OPEN_LINES} more open entries`);
  }

  if (settled.length > 0) {
    lines.push("", `*Settled* (${settled.length})`);
    for (const entry of settled.slice(0, MAX_SETTLED_LINES)) {
      lines.push(`✔️ ${entry.title} · ${shortDay(entry.eventDate)}: ${formatMoney(entry.amountMinor, entry.currency)}`);
    }
    if (settled.length > MAX_SETTLED_LINES) lines.push(`…and ${settled.length - MAX_SETTLED_LINES} older settled entries`);
  }

  lines.push("", RULE, SIGNATURE);
  return lines.join("\n");
}
