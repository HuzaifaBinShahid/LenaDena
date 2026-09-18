// Pure People helpers: who a personal entry belongs to, per-person balances, ordering, search, initials,
// avatar tints and the plain-language copy the People screens show.
// No react-native imports: Vitest runs this file, so runtime imports stay relative (D21).
import type { Person, Plan, TransactionItem } from "@/features/ledger/types";
import { describeTransaction, type TransactionRowCopy } from "../ledger/rowCopy";
import { dateToIso, firstName, formatDayMonth, formatMoney } from "../../lib/format";

// ---------------------------------------------------------------------------------------------------------
// Names and emails (the same rules the API applies, so the form can answer before the server does)

export const PERSON_NAME_MAX = 80;
export const PERSON_EMAIL_MAX = 254;

// Deliberately basic (name@domain.tld, no spaces), matching backend/src/domain/people.ts.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** Two spellings name the same person when they match after trimming, ignoring case (the API's rule). */
export function personNameKey(name: string): string {
  return name.trim().toLowerCase();
}

/** The form error for a name, or undefined when it can be saved. Length counts characters, not UTF-16 units. */
export function personNameError(name: string): string | undefined {
  const trimmed = name.trim();
  if (!trimmed) return "Add their name.";
  if (Array.from(trimmed).length > PERSON_NAME_MAX) return `Keep the name to ${PERSON_NAME_MAX} characters or fewer.`;
  return undefined;
}

/** A blank email is fine (it's optional); anything else must look like name@domain.tld. */
export function personEmailError(email: string): string | undefined {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return undefined;
  if (trimmed.length > PERSON_EMAIL_MAX || !EMAIL_PATTERN.test(trimmed)) return "Enter a valid email, or leave it empty.";
  return undefined;
}

/** The saved person whose name matches exactly (trimmed, case-insensitive). Names are unique per owner. */
export function findPersonByName(people: readonly Person[], name: string): Person | undefined {
  const key = personNameKey(name);
  if (!key) return undefined;
  return people.find((person) => personNameKey(person.name) === key);
}

/** "M" for "Mani", "AK" for "Ali Khan", "?" for a blank name. Counts characters, so emoji and accents stay whole. */
export function personInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  if (!first) return "?";
  const initial = (word: string) => Array.from(word)[0] ?? "";
  const last = words.length > 1 ? words[words.length - 1] : undefined;
  return (initial(first) + (last ? initial(last) : "")).toUpperCase();
}

/** First name for compact places (the People strip, chips); falls back to the whole trimmed name. */
export function personFirstName(name: string): string {
  return firstName(name) || name.trim() || "Someone";
}

/**
 * Short labels for a set of people (strip and chips): the first name, "Ali K." when two people share a first
 * name, and the full name when even that would collide. Keyed by person id.
 */
export function shortNames(people: readonly Pick<Person, "id" | "name">[]): Map<string, string> {
  const words = (name: string) => name.trim().split(/\s+/).filter(Boolean);
  const firstKey = (name: string) => personFirstName(name).toLowerCase();
  const initialed = (name: string) => {
    const parts = words(name);
    const last = parts.length > 1 ? parts[parts.length - 1] : undefined;
    const initial = last ? Array.from(last)[0]?.toUpperCase() : undefined;
    return initial ? `${personFirstName(name)} ${initial}.` : personFirstName(name);
  };
  const count = (keys: string[]) => keys.reduce((map, key) => map.set(key, (map.get(key) ?? 0) + 1), new Map<string, number>());
  const firstCounts = count(people.map((person) => firstKey(person.name)));
  const initialCounts = count(people.map((person) => initialed(person.name).toLowerCase()));
  const labels = new Map<string, string>();
  for (const person of people) {
    if ((firstCounts.get(firstKey(person.name)) ?? 0) < 2) labels.set(person.id, personFirstName(person.name));
    else if ((initialCounts.get(initialed(person.name).toLowerCase()) ?? 0) < 2) labels.set(person.id, initialed(person.name));
    else labels.set(person.id, person.name.trim() || "Someone");
  }
  return labels;
}

// ---------------------------------------------------------------------------------------------------------
// Avatar tints. Clay/brand colours that read in both themes: mid-tone gradients with initials at 4.5:1 or
// better. Mint and coral are left out on purpose: around a person they mean "owes you" / "you owe".

export type PersonTintKey = "violet" | "plum" | "lavender" | "gold" | "sky" | "orchid";

export type PersonTint = {
  key: PersonTintKey;
  /** Gradient start (top left) and end (bottom right). */
  from: string;
  to: string;
  /** Initials colour on the disc. */
  ink: string;
};

export const PERSON_TINTS: readonly PersonTint[] = Object.freeze([
  { key: "violet", from: "#957EFA", to: "#6040CD", ink: "#FFFFFF" },
  { key: "plum", from: "#6A4BD6", to: "#321C6F", ink: "#FFFFFF" },
  { key: "lavender", from: "#DCD4FF", to: "#A08BFC", ink: "#2A1763" },
  { key: "gold", from: "#F8D29D", to: "#DDA657", ink: "#4F3209" },
  { key: "sky", from: "#B9D2F7", to: "#6F9BE3", ink: "#0F2550" },
  { key: "orchid", from: "#F1C9EE", to: "#C98AD0", ink: "#461546" },
]);

/** Deterministic tint for a name (FNV-1a over the name key), so a person keeps their colour everywhere. */
export function personTint(name: string): PersonTint {
  const key = personNameKey(name);
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return PERSON_TINTS[hash % PERSON_TINTS.length] ?? (PERSON_TINTS[0] as PersonTint);
}

// ---------------------------------------------------------------------------------------------------------
// Entries and balances

export type PersonCurrencyBalance = {
  currency: string;
  /** Open amounts they owe you. */
  owedMinor: number;
  /** Open amounts you owe them. */
  oweMinor: number;
  /** owed − owe: positive means they owe you. */
  netMinor: number;
};

/**
 * owed / owe: every open currency leans one way. mixed: currencies lean different ways. even: open entries
 * cancel out. settled: history, nothing open. new: no entries yet.
 */
export type PersonStanding = "owed" | "owe" | "mixed" | "even" | "settled" | "new";

export type PersonSummary = {
  person: Person;
  /** Open personal entries per currency, A→Z. Empty when nothing is open. */
  balances: PersonCurrencyBalance[];
  standing: PersonStanding;
  entryCount: number;
  openCount: number;
  /** Latest time an entry was recorded or settled (ms since epoch); undefined with no entries. */
  lastActivityMs?: number;
};

function finiteMinor(value: number) {
  return Number.isFinite(value) ? Math.abs(value) : 0;
}

function parseTime(value: string | undefined): number {
  if (!value) return Number.NaN;
  return Date.parse(value);
}

/** When the entry last changed: settled, else recorded, else its (noon UTC) event date. */
function activityTime(item: TransactionItem): number {
  let best = Number.NaN;
  for (const value of [item.createdAt, item.settledAt]) {
    const time = parseTime(value);
    if (Number.isFinite(time) && (Number.isNaN(best) || time > best)) best = time;
  }
  if (Number.isFinite(best)) return best;
  return /^\d{4}-\d{2}-\d{2}$/.test(item.eventDate) ? Date.parse(`${item.eventDate}T12:00:00.000Z`) : Number.NaN;
}

/** Newest first: later event date, then later recording time. */
function compareEntries(left: TransactionItem, right: TransactionItem): number {
  if (left.eventDate !== right.eventDate) return left.eventDate < right.eventDate ? 1 : -1;
  const leftTime = parseTime(left.createdAt);
  const rightTime = parseTime(right.createdAt);
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) return rightTime - leftTime;
  return 0;
}

/**
 * Each person's personal entries, newest first. A row belongs to the person it is linked to (`personId`); an
 * unlinked row (older data, or one whose link is gone) belongs to the person with the same name, if any.
 */
export function indexPersonEntries(people: readonly Person[], transactions: readonly TransactionItem[]): Map<string, TransactionItem[]> {
  const index = new Map<string, TransactionItem[]>();
  const idByName = new Map<string, string>();
  for (const person of people) {
    index.set(person.id, []);
    const key = personNameKey(person.name);
    if (key && !idByName.has(key)) idByName.set(key, person.id);
  }
  for (const item of transactions) {
    if (item.source !== "personal") continue;
    const linked = item.personId && index.has(item.personId) ? item.personId : undefined;
    const id = linked ?? (item.counterparty ? idByName.get(personNameKey(item.counterparty)) : undefined);
    if (id) index.get(id)?.push(item);
  }
  for (const list of index.values()) list.sort(compareEntries);
  return index;
}

function standingOf(balances: readonly PersonCurrencyBalance[], entryCount: number): PersonStanding {
  if (entryCount === 0) return "new";
  if (balances.length === 0) return "settled";
  const owed = balances.some((balance) => balance.netMinor > 0);
  const owe = balances.some((balance) => balance.netMinor < 0);
  if (owed && owe) return "mixed";
  if (owed) return "owed";
  if (owe) return "owe";
  return "even";
}

/** Balances, counts and last activity for one person from their entries (see indexPersonEntries). */
export function summarizePerson(person: Person, entries: readonly TransactionItem[]): PersonSummary {
  const byCurrency = new Map<string, PersonCurrencyBalance>();
  let openCount = 0;
  let lastActivityMs = Number.NaN;
  for (const item of entries) {
    const time = activityTime(item);
    if (Number.isFinite(time) && (Number.isNaN(lastActivityMs) || time > lastActivityMs)) lastActivityMs = time;
    if (item.status === "settled") continue;
    openCount += 1;
    const balance = byCurrency.get(item.currency) ?? { currency: item.currency, owedMinor: 0, oweMinor: 0, netMinor: 0 };
    const amount = finiteMinor(item.amountMinor);
    if (item.direction === "incoming") balance.owedMinor += amount;
    else balance.oweMinor += amount;
    balance.netMinor = balance.owedMinor - balance.oweMinor;
    byCurrency.set(item.currency, balance);
  }
  const balances = Array.from(byCurrency.values()).sort((left, right) => left.currency.localeCompare(right.currency));
  return {
    person,
    balances,
    standing: standingOf(balances, entries.length),
    entryCount: entries.length,
    openCount,
    ...(Number.isFinite(lastActivityMs) ? { lastActivityMs } : {}),
  };
}

/** One summary per saved person, in `plan.people` order. */
export function summarizePeople(plan: Pick<Plan, "people" | "transactions">): PersonSummary[] {
  const index = indexPersonEntries(plan.people, plan.transactions);
  return plan.people.map((person) => summarizePerson(person, index.get(person.id) ?? []));
}

/** The currency to lead with: the largest open amount either way (ties A→Z). Undefined when nothing is owed. */
export function primaryBalance(summary: Pick<PersonSummary, "balances">): PersonCurrencyBalance | undefined {
  let best: PersonCurrencyBalance | undefined;
  for (const balance of summary.balances) {
    if (balance.netMinor === 0) continue;
    if (!best || Math.abs(balance.netMinor) > Math.abs(best.netMinor)) best = balance;
  }
  return best;
}

/** Per currency, what people owe you in total and what you owe in total (each person counted by their net). */
export function peopleTotals(summaries: readonly PersonSummary[]): { currency: string; owedMinor: number; oweMinor: number }[] {
  const totals = new Map<string, { currency: string; owedMinor: number; oweMinor: number }>();
  for (const summary of summaries) {
    for (const balance of summary.balances) {
      if (balance.netMinor === 0) continue;
      const total = totals.get(balance.currency) ?? { currency: balance.currency, owedMinor: 0, oweMinor: 0 };
      if (balance.netMinor > 0) total.owedMinor += balance.netMinor;
      else total.oweMinor += -balance.netMinor;
      totals.set(balance.currency, total);
    }
  }
  return Array.from(totals.values()).sort((left, right) => left.currency.localeCompare(right.currency));
}

// ---------------------------------------------------------------------------------------------------------
// Ordering and search

function compareNames(left: Person, right: Person): number {
  const byName = left.name.trim().localeCompare(right.name.trim(), undefined, { sensitivity: "base" });
  if (byName !== 0) return byName;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function lastActivity(summary: PersonSummary): number {
  return summary.lastActivityMs ?? Number.NEGATIVE_INFINITY;
}

/** Lists: people with open entries first (most recent activity first), then everyone else A→Z. */
export function sortPeopleForList(summaries: readonly PersonSummary[]): PersonSummary[] {
  return [...summaries].sort((left, right) => {
    const leftOpen = left.openCount > 0;
    const rightOpen = right.openCount > 0;
    if (leftOpen !== rightOpen) return leftOpen ? -1 : 1;
    if (leftOpen) {
      const byActivity = lastActivity(right) - lastActivity(left);
      if (byActivity !== 0 && Number.isFinite(byActivity)) return byActivity;
    }
    return compareNames(left.person, right.person);
  });
}

/** Pickers: most recently used first (entries recorded or settled); people without entries by newest added. */
export function sortPeopleByRecentUse(summaries: readonly PersonSummary[]): PersonSummary[] {
  const added = (summary: PersonSummary) => {
    const time = parseTime(summary.person.createdAt);
    return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
  };
  return [...summaries].sort((left, right) => {
    const leftUsed = left.lastActivityMs !== undefined;
    const rightUsed = right.lastActivityMs !== undefined;
    if (leftUsed !== rightUsed) return leftUsed ? -1 : 1;
    const byTime = leftUsed ? lastActivity(right) - lastActivity(left) : added(right) - added(left);
    if (byTime !== 0 && Number.isFinite(byTime)) return byTime;
    return compareNames(left.person, right.person);
  });
}

/** Lower case, trimmed, inner whitespace collapsed and accents removed ("  Zoë  K " → "zoe k"). */
export function normalizeSearchText(value: string): string {
  let text = value;
  try {
    text = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  } catch {
    // Without normalize() the raw text still matches exact spellings.
  }
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/** 0 name starts with it, 1 a later word starts with it, 2 name contains it, 3 email contains it, -1 no match. */
function matchRank(person: Person, query: string): number {
  const name = normalizeSearchText(person.name);
  if (name.startsWith(query)) return 0;
  if (name.split(/[\s\-'.]+/).some((word) => word.startsWith(query))) return 1;
  if (name.includes(query)) return 2;
  if (person.email && normalizeSearchText(person.email).includes(query)) return 3;
  return -1;
}

/**
 * Items whose person matches `query` (case- and accent-insensitive, trimmed): name starts first, then word
 * starts, then anywhere in the name, then email. Ties keep the input order. A blank query returns every item.
 */
export function searchPeople<T>(items: readonly T[], query: string, personOf: (item: T) => Person, limit?: number): T[] {
  const needle = normalizeSearchText(query);
  const max = limit === undefined ? Number.POSITIVE_INFINITY : Math.max(0, Math.floor(limit));
  if (!needle) return items.slice(0, max);
  return items
    .map((item, order) => ({ item, order, rank: matchRank(personOf(item), needle) }))
    .filter((entry) => entry.rank >= 0)
    .sort((left, right) => left.rank - right.rank || left.order - right.order)
    .slice(0, max)
    .map((entry) => entry.item);
}

// ---------------------------------------------------------------------------------------------------------
// Copy

export type StandingTone = "positive" | "negative" | "neutral";

/** Status words for rows and chips: "Owes you", "You owe", "Settled"… with their semantic tone. */
export function standingLabel(standing: PersonStanding): { label: string; tone: StandingTone } {
  switch (standing) {
    case "owed":
      return { label: "Owes you", tone: "positive" };
    case "owe":
      return { label: "You owe", tone: "negative" };
    case "mixed":
      return { label: "Both ways", tone: "neutral" };
    case "even":
      return { label: "Even", tone: "neutral" };
    case "settled":
      return { label: "Settled", tone: "neutral" };
    default:
      return { label: "No entries yet", tone: "neutral" };
  }
}

/** One line about where you stand, for pickers and rows: "Owes you Rs 2,400", "You owe Rs 800", "Settled". */
export function standingLine(summary: PersonSummary): string {
  const primary = primaryBalance(summary);
  const extra = summary.balances.filter((balance) => balance.netMinor !== 0).length > 1 ? " + more" : "";
  if (summary.standing === "owed" && primary) return `Owes you ${formatMoney(primary.netMinor, primary.currency)}${extra}`;
  if (summary.standing === "owe" && primary) return `You owe ${formatMoney(-primary.netMinor, primary.currency)}${extra}`;
  if (summary.standing === "mixed") return "Balances both ways";
  if (summary.standing === "even") return "Open entries cancel out";
  if (summary.standing === "settled") return "All settled";
  return "No entries yet";
}

export type BalanceStatement = {
  /** "Mani owes you", "You owe Mani", "All settled with Mani". */
  headline: string;
  /** Amounts in the headline's direction, largest first ("Rs 2,400", "$10"). Empty when nothing is owed. */
  amounts: string[];
  tone: StandingTone;
  /** The whole statement as one sentence (screen readers, toasts). */
  sentence: string;
};

function joinAmounts(amounts: readonly string[]): string {
  if (amounts.length <= 1) return amounts[0] ?? "";
  return `${amounts.slice(0, -1).join(", ")} and ${amounts[amounts.length - 1]}`;
}

/** The plain-language balance line on a person's page. */
export function balanceStatement(summary: PersonSummary): BalanceStatement {
  const name = personFirstName(summary.person.name);
  const leaning = [...summary.balances]
    .filter((balance) => balance.netMinor !== 0)
    .sort((left, right) => Math.abs(right.netMinor) - Math.abs(left.netMinor) || left.currency.localeCompare(right.currency));
  const format = (balance: PersonCurrencyBalance) => formatMoney(Math.abs(balance.netMinor), balance.currency);
  switch (summary.standing) {
    case "owed": {
      const amounts = leaning.map(format);
      return { headline: `${name} owes you`, amounts, tone: "positive", sentence: `${name} owes you ${joinAmounts(amounts)}` };
    }
    case "owe": {
      const amounts = leaning.map(format);
      return { headline: `You owe ${name}`, amounts, tone: "negative", sentence: `You owe ${name} ${joinAmounts(amounts)}` };
    }
    case "mixed": {
      const theyOwe = joinAmounts(leaning.filter((balance) => balance.netMinor > 0).map(format));
      const youOwe = joinAmounts(leaning.filter((balance) => balance.netMinor < 0).map(format));
      return { headline: "Balances both ways", amounts: [], tone: "neutral", sentence: `${name} owes you ${theyOwe}, and you owe ${name} ${youOwe}` };
    }
    case "even":
      return { headline: `You and ${name} are even`, amounts: [], tone: "neutral", sentence: `You and ${name} are even: the open entries cancel out` };
    case "settled":
      return { headline: `All settled with ${name}`, amounts: [], tone: "neutral", sentence: `All settled with ${name}` };
    default:
      return { headline: `No balances with ${name} yet`, amounts: [], tone: "neutral", sentence: `No balances with ${name} yet` };
  }
}

/** Month sections for a person's history, newest month first; entries keep their order inside a month. */
export function groupEntriesByMonth(entries: readonly TransactionItem[]): { month: string; items: TransactionItem[] }[] {
  const months = new Map<string, TransactionItem[]>();
  for (const item of entries) {
    const month = /^\d{4}-\d{2}/.exec(item.eventDate)?.[0] ?? /^\d{4}-\d{2}/.exec(item.createdAt)?.[0] ?? "";
    const list = months.get(month);
    if (list) list.push(item);
    else months.set(month, [item]);
  }
  return Array.from(months, ([month, items]) => ({ month, items })).sort((left, right) => right.month.localeCompare(left.month));
}

export type PersonEntryCopy = Pick<TransactionRowCopy, "title" | "amount" | "status" | "tile" | "canSettle"> & {
  subtitle: string;
  accessibilityLabel: string;
};

/** A row in a person's history: "13 Sep · Loan", "Due 20 Sep · Expense", "2 Sep · Expense · settled 5 Sep". */
export function describePersonEntry(item: TransactionItem, today: string): PersonEntryCopy {
  const copy = describeTransaction(item, { context: "activity", today });
  const kind = item.kind === "loan" ? "Loan" : item.kind === "payment" ? "Payment" : "Expense";
  const day = formatDayMonth(item.eventDate);
  const when = copy.upcoming && item.status !== "settled" ? `Due ${day}` : day;
  // The settled day on this device's calendar, as Activity's balance history counts it.
  const settledTime = item.status === "settled" ? parseTime(item.settledAt) : Number.NaN;
  const settledDay = Number.isFinite(settledTime) ? dateToIso(new Date(settledTime)) : undefined;
  const subtitle = [when, kind, settledDay ? `settled ${formatDayMonth(settledDay)}` : null].filter(Boolean).join(" · ");
  return {
    title: copy.title,
    subtitle,
    amount: copy.amount,
    status: copy.status,
    tile: copy.tile,
    canSettle: copy.canSettle,
    accessibilityLabel: copy.accessibilityLabel,
  };
}

// ---------------------------------------------------------------------------------------------------------
// Errors

/**
 * Friendly copy for People error codes (null keeps the server's own message). On a People route a bare 404
 * means the server predates People.
 */
export function peopleErrorMessage(error: { status: number; code?: string | undefined }, options: { name?: string | undefined; peopleRoute?: boolean } = {}): string | null {
  const name = options.name?.trim();
  switch (error.code) {
    case "person_exists":
      return name ? `${name} is already in your people.` : "Someone with this name is already in your people.";
    case "people_unavailable":
      return "People needs the latest database update. Try again once it's applied.";
    case "person_not_found":
      return "This person is no longer in your people. Refresh and try again.";
    default:
      if (options.peopleRoute && error.status === 404 && !error.code) return "People needs the latest server update.";
      return null;
  }
}
