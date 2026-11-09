import { cleanText } from "./format.js";

/**
 * A snapshot of everything between the account owner and one saved person, taken by the database when an email is
 * queued (see private.person_snapshot in supabase/migrations/202611100010_person_emails.sql). The worker renders the
 * email and the PDF from it alone, so a statement shows the figures as they were when it was queued.
 *
 * Directions are from the OWNER's side: `outgoing` means the owner owes the person, `incoming` means the person owes
 * the owner. Emails go to the person, so templates flip the wording.
 */
export type StatementEntry = {
  id: string;
  title: string;
  /** YYYY-MM-DD. */
  eventDate: string;
  amountMinor: number;
  /** How much of `amountMinor` has been paid so far. */
  paidMinor: number;
  /** Upper-case ISO 4217 code. */
  currency: string;
  direction: "incoming" | "outgoing";
  kind: "expense" | "loan";
  status: "open" | "settled";
  note?: string;
};

/** What is still unpaid in one currency, split by who owes whom. */
export type StatementTotal = {
  currency: string;
  personOwesMinor: number;
  ownerOwesMinor: number;
};

export type StatementData = {
  ownerName: string;
  personName: string;
  /** ISO timestamp of the snapshot. */
  generatedAt: string;
  /** Newest first; open and settled entries together, capped at STATEMENT_ENTRY_LIMIT. */
  entries: StatementEntry[];
  /** One per currency that still has an unpaid amount. */
  totals: StatementTotal[];
  /** All entries with this person, which can be more than `entries.length` when truncated. */
  entryCount: number;
  openCount: number;
};

/** Entries beyond this are left out of a statement (the totals still count every one). */
export const STATEMENT_ENTRY_LIMIT = 300;

const CURRENCY = /^[A-Za-z]{3}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function minor(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === "string" && /^\d{1,15}$/.test(value.trim())) return Number(value.trim());
  return undefined;
}

function entryFrom(value: unknown): StatementEntry | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const title = cleanText(raw.title, 80);
  const amountMinor = minor(raw.amountMinor);
  const paidMinor = minor(raw.paidMinor) ?? 0;
  const currency = typeof raw.currency === "string" && CURRENCY.test(raw.currency.trim()) ? raw.currency.trim().toUpperCase() : undefined;
  const eventDate = typeof raw.eventDate === "string" && DATE.test(raw.eventDate.trim()) ? raw.eventDate.trim() : undefined;
  if (!title || amountMinor === undefined || amountMinor <= 0 || !currency || !eventDate) return undefined;
  const direction = raw.direction === "incoming" ? "incoming" : raw.direction === "outgoing" ? "outgoing" : undefined;
  if (!direction) return undefined;
  const note = cleanText(raw.note, 300);
  return {
    id: cleanText(raw.id, 64) ?? "",
    title,
    eventDate,
    amountMinor,
    paidMinor: Math.min(paidMinor, amountMinor),
    currency,
    direction,
    kind: raw.kind === "loan" ? "loan" : "expense",
    status: raw.status === "settled" ? "settled" : "open",
    ...(note ? { note } : {}),
  };
}

function totalFrom(value: unknown): StatementTotal | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const currency = typeof raw.currency === "string" && CURRENCY.test(raw.currency.trim()) ? raw.currency.trim().toUpperCase() : undefined;
  const personOwesMinor = minor(raw.personOwesMinor) ?? 0;
  const ownerOwesMinor = minor(raw.ownerOwesMinor) ?? 0;
  if (!currency || (personOwesMinor === 0 && ownerOwesMinor === 0)) return undefined;
  return { currency, personOwesMinor, ownerOwesMinor };
}

/**
 * Reads a snapshot from an outbox payload without trusting it: bad entries and totals are dropped, text is cleaned
 * and capped, and a missing field falls back to something printable.
 */
export function parseStatement(payload: Record<string, unknown>): StatementData {
  const entries = (Array.isArray(payload.entries) ? payload.entries : [])
    .map(entryFrom)
    .filter((entry): entry is StatementEntry => entry !== undefined)
    .slice(0, STATEMENT_ENTRY_LIMIT);
  const totals = (Array.isArray(payload.totals) ? payload.totals : [])
    .map(totalFrom)
    .filter((total): total is StatementTotal => total !== undefined);
  const generated = typeof payload.generatedAt === "string" ? new Date(payload.generatedAt) : undefined;
  const entryCount = minor(payload.entryCount) ?? entries.length;
  return {
    ownerName: cleanText(payload.ownerName, 80) ?? "A friend",
    personName: cleanText(payload.personName, 80) ?? "you",
    generatedAt: generated && !Number.isNaN(generated.getTime()) ? generated.toISOString() : new Date().toISOString(),
    entries,
    totals,
    entryCount: Math.max(entryCount, entries.length),
    openCount: minor(payload.openCount) ?? entries.filter((entry) => entry.status === "open").length,
  };
}

/** The unpaid amount left on an entry. */
export function remainingOf(entry: Pick<StatementEntry, "amountMinor" | "paidMinor" | "status">): number {
  return entry.status === "settled" ? 0 : Math.max(0, entry.amountMinor - entry.paidMinor);
}

/**
 * Who is ahead in one currency, from the PERSON's side (the reader of the email): `personOwes` means the person owes
 * the owner `amountMinor`; `ownerOwes` the other way round; `even` when they cancel out.
 */
export function netPosition(total: StatementTotal): { side: "personOwes" | "ownerOwes" | "even"; amountMinor: number } {
  const net = total.personOwesMinor - total.ownerOwesMinor;
  if (net > 0) return { side: "personOwes", amountMinor: net };
  if (net < 0) return { side: "ownerOwes", amountMinor: -net };
  return { side: "even", amountMinor: 0 };
}
