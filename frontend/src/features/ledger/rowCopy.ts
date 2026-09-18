// Pure copy mapper for ledger rows (D6). No react-native imports: Vitest runs this file, so runtime imports stay relative (D21).
import type { TransactionItem } from "@/features/ledger/types";
import { formatLongDate, formatMoney, formatShortDate, formatSignedMoney } from "../../lib/format";

export type AmountTone = "positive" | "negative" | "neutral";
export type StatusTone = "neutral" | "positive" | "warning" | "danger";
export type EntryTone = "violet" | "lavender" | "mint" | "coral" | "gold" | "neutral";
export type CornerBadgeKind = "in" | "out" | "clock" | "check" | "send";

export type TransactionRowCopy = {
  title: string;
  subtitle: string;
  amount: { text: string; tone: AmountTone };
  status: { label: string; tone: StatusTone };
  tile: { icon: "file-text" | "cash" | "check-circle" | "send"; tone: EntryTone; badge?: CornerBadgeKind };
  canSettle: boolean;
  upcoming: boolean;
  accessibilityLabel: string;
};

const KIND_TITLES: Record<TransactionItem["kind"], string> = {
  expense: "Expense",
  loan: "Loan",
  payment: "Payment",
};

/** "{cp} owes you", "You owe {cp}", "Owed back to you", "Your share", "{cp} paid you", "You paid {cp}". */
function whoPhrase(item: TransactionItem): string {
  const incoming = item.direction === "incoming";
  const counterparty = item.counterparty?.trim();
  if (item.kind === "payment") {
    if (incoming) return counterparty ? `${counterparty} paid you` : "Paid to you";
    return counterparty ? `You paid ${counterparty}` : "You paid";
  }
  if (item.source === "group") {
    if (incoming) return "Owed back to you";
    return counterparty ? `You owe ${counterparty}` : "Your share";
  }
  if (incoming) return counterparty ? `${counterparty} owes you` : "Owed to you";
  return counterparty ? `You owe ${counterparty}` : "You owe";
}

function statusOf(item: TransactionItem): TransactionRowCopy["status"] {
  if (item.kind === "payment") return { label: "Paid", tone: "positive" };
  if (item.source === "personal") {
    return item.status === "settled" ? { label: "Settled", tone: "positive" } : { label: "Open", tone: "warning" };
  }
  // Group rows carry no status, so the label comes from kind and direction.
  return item.direction === "incoming" ? { label: "Owed to you", tone: "positive" } : { label: "You owe", tone: "danger" };
}

function tileOf(item: TransactionItem): TransactionRowCopy["tile"] {
  const badge: CornerBadgeKind = item.direction === "incoming" ? "in" : "out";
  if (item.kind === "payment") return { icon: item.direction === "incoming" ? "check-circle" : "send", tone: "mint" };
  if (item.kind === "loan") return { icon: "cash", tone: "lavender", badge };
  return { icon: "file-text", tone: "violet", badge };
}

export function describeTransaction(
  item: TransactionItem,
  options: { context: "activity" | "group"; today: string },
): TransactionRowCopy {
  const incoming = item.direction === "incoming";
  const payment = item.kind === "payment";
  const title = item.title.trim() ? item.title : KIND_TITLES[item.kind];
  const who = whoPhrase(item);

  const subtitle =
    options.context === "group"
      ? `${formatShortDate(item.eventDate)} · ${who}`
      : `${who} · ${item.source === "personal" ? "Personal" : item.groupName?.trim() || "Group"}`;

  const amount: TransactionRowCopy["amount"] = payment
    ? { text: formatSignedMoney(item.amountMinor, item.currency, "none"), tone: "neutral" }
    : incoming
      ? { text: formatSignedMoney(item.amountMinor, item.currency, "+"), tone: "positive" }
      : { text: formatSignedMoney(item.amountMinor, item.currency, "-"), tone: "negative" };

  const status = statusOf(item);
  const direction = payment ? "paid" : incoming ? "owed to you" : "you owe";
  const spokenAmount = formatMoney(Number.isFinite(item.amountMinor) ? Math.abs(item.amountMinor) : 0, item.currency);

  return {
    title,
    subtitle,
    amount,
    status,
    tile: tileOf(item),
    canSettle: item.source === "personal" && item.status === "open",
    upcoming: item.eventDate > options.today,
    accessibilityLabel: `${title}. ${who}. ${spokenAmount}, ${direction}. ${status.label}. ${formatLongDate(item.eventDate)}.`,
  };
}

export type PersonLink = {
  id: string;
  name: string;
  /** First name, for the compact link beside "Mark settled". */
  label: string;
  /** Screen-reader hint for the row or link that opens the person. */
  hint: string;
};

/**
 * The saved person behind a personal row. Only personal rows link, and only while the person still
 * exists: deleting a person leaves their entries in Activity, unlinked.
 */
export function personLink(
  item: Pick<TransactionItem, "source" | "personId">,
  people: ReadonlyMap<string, { id: string; name: string }>,
): PersonLink | null {
  if (item.source !== "personal" || !item.personId) return null;
  const person = people.get(item.personId);
  const name = person?.name.trim();
  if (!person || !name) return null;
  return { id: person.id, name, label: name.split(/\s+/)[0] ?? name, hint: `Opens ${name}'s balances and history` };
}
