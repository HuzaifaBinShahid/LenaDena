import { DomainError } from "./errors.js";

/**
 * A person's own data for Settings -> Export my data: the shape app_export_data (supabase/migrations/
 * 202611170014_export_data.sql) returns, and the CSV built from it. Other people appear by display name only (never an
 * email or an id), and photos are flagged, not included. Amounts are minor units (1/100 of the currency).
 */
export type ExportDocument = {
  format: "lenadena-export";
  version: 1;
  exportedAt: string;
  account: { name: string; email: string; createdAt: string; lastSeenAt?: string; emailTone?: string; theme?: string };
  groups: Array<{ name: string; currency: string; role: string; joinedAt: string; leftAt?: string; archived: boolean; members: Array<{ name: string }> }>;
  expenses: Array<{
    group: string; title: string; date: string; amountMinor: number; currency: string; paidBy: string; paidByMe: boolean;
    splitMethod: string; note?: string; hasReceipt: boolean; createdAt: string; editedAt?: string;
    shares: Array<{ person: string; isMe: boolean; amountMinor: number; percentageBasisPoints?: number }>;
  }>;
  payments: Array<{
    group: string; from: string; to: string; fromMe: boolean; amountMinor: number; currency: string; status: string;
    note?: string; reviewNote?: string; hasProof: boolean; confirmationMethod?: string; createdAt: string; reviewedAt?: string;
  }>;
  individualBalances: Array<{
    title: string; date: string; person: string; kind: string; direction: "incoming" | "outgoing"; amountMinor: number; currency: string;
    paidMinor: number; status: string; settledAt?: string; note?: string; hasReceipt: boolean; createdAt: string;
  }>;
  people: Array<{ name: string; email?: string; reminders: string; hasPhoto: boolean; createdAt: string }>;
  activity: Array<{ group: string; kind: string; title: string; detail: string; createdAt: string }>;
  emails: Array<{ type: string; to: string; createdAt: string; sentAt?: string }>;
  /** Phones registered for notifications (platform and date; never the token). Absent on a database without 202611170016. */
  notificationDevices?: Array<{ platform: string; registeredAt: string }>;
};

export type ExportFormat = "json" | "csv";

/** The database has not been given the export function yet. */
export class ExportUnavailableError extends DomainError {
  constructor() {
    super("Export isn't switched on yet. Try again after the next update.", 503, "export_unavailable");
  }
}

/** Vercel answers at most about 4.5 MB; stay under it and say so, instead of failing in the middle. */
export const EXPORT_MAX_BYTES = 4_000_000;

export function exportTooLarge() {
  return new DomainError("Your records are too large to download in one file. Write to us and we will send them to you.", 413, "export_too_large");
}

export function exportFileName(format: ExportFormat, now: Date): string {
  return `lenadena-export-${now.toISOString().slice(0, 10)}.${format}`;
}

export function exportContentType(format: ExportFormat): string {
  return format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8";
}

const COLUMNS = ["Type", "Date", "Title", "Group or person", "Direction", "Amount", "Currency", "My share", "Paid so far", "Status", "Note", "Added", "Edited"] as const;

/** 123456 -> "1234.56". Always two decimals, so a spreadsheet reads it as a number. */
export function minorToDecimal(minor: number): string {
  return (minor / 100).toFixed(2);
}

type Cell = { text: string } | { number: number } | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * One CSV field (RFC 4180). Text a spreadsheet could read as a formula (it starts with = + - @ or a tab) gets a leading
 * apostrophe, because titles and notes can be typed by other people in a shared group and this file is meant to be
 * opened in Excel or Sheets. Numbers are written as they are.
 */
function field(cell: Cell): string {
  if (!cell) return "";
  if ("number" in cell) return minorToDecimal(cell.number);
  const text = FORMULA_START.test(cell.text) ? `'${cell.text}` : cell.text;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const text = (value: string | undefined): Cell => (value ? { text: value } : undefined);
const day = (value: string | undefined): Cell => (value ? { text: value.slice(0, 10) } : undefined);

type Row = { sort: string; cells: Cell[] };

/**
 * The spreadsheet version: individual balances, group expenses and payments, newest first, in one table. The JSON file
 * has everything else (groups, people, activity, emails). Starts with a byte-order mark so Excel reads names in any
 * script (Urdu included) correctly.
 */
export function buildCsv(doc: ExportDocument): string {
  const rows: Row[] = [];
  for (const balance of doc.individualBalances) {
    rows.push({
      sort: balance.date,
      cells: [
        text("Individual balance"), day(balance.date), text(balance.title), text(balance.person),
        text(balance.direction === "outgoing" ? "I owe" : "Owed to me"), { number: balance.amountMinor }, text(balance.currency),
        undefined, { number: balance.paidMinor }, text(balance.status), text(balance.note), day(balance.createdAt), undefined,
      ],
    });
  }
  for (const expense of doc.expenses) {
    const mine = expense.shares.find((share) => share.isMe);
    rows.push({
      sort: expense.date,
      cells: [
        text("Group expense"), day(expense.date), text(expense.title), text(expense.group),
        text(expense.paidByMe ? "I paid" : `${expense.paidBy} paid`), { number: expense.amountMinor }, text(expense.currency),
        mine ? { number: mine.amountMinor } : undefined, undefined, undefined, text(expense.note), day(expense.createdAt), day(expense.editedAt),
      ],
    });
  }
  for (const payment of doc.payments) {
    rows.push({
      sort: payment.createdAt.slice(0, 10),
      cells: [
        text("Payment"), day(payment.createdAt), text(`${payment.from} to ${payment.to}`), text(payment.group),
        text(payment.fromMe ? "I paid" : "I received"), { number: payment.amountMinor }, text(payment.currency),
        undefined, undefined, text(payment.status), text(payment.reviewNote ?? payment.note), day(payment.createdAt), undefined,
      ],
    });
  }
  rows.sort((a, b) => b.sort.localeCompare(a.sort));
  const lines = [COLUMNS.map((name) => field({ text: name })).join(","), ...rows.map((row) => row.cells.map(field).join(","))];
  return `﻿${lines.join("\r\n")}\r\n`;
}
