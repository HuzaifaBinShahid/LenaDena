import { formatMoney } from "../../lib/format";
import type { ExpenseDetail, ExpenseShare, SplitMethod, TransactionItem } from "./types";

/**
 * The rules of editing and deleting, kept out of the screens so they can be tested. The server is the authority (it
 * refuses anything these let through); this only decides what to show and what to warn about. Mirrors
 * supabase/migrations/202611170013_edit_delete_entries.sql.
 */

/** A row can be opened for changing when the server says the person may edit or delete it. Missing flags mean no. */
export function canChange(item: Pick<TransactionItem, "canEdit" | "canDelete">): boolean {
  return item.canEdit === true || item.canDelete === true;
}

export type PersonalLocks = {
  /** Already paid on this balance. */
  paidMinor: number;
  /** A fully paid balance keeps its amount. */
  amountLocked: boolean;
  /** Once any payment is recorded, who owes whom and the currency stay as they are. */
  sideLocked: boolean;
  /** The smallest amount the balance may be changed to. */
  minAmountMinor: number;
};

export function personalLocks(item: Pick<TransactionItem, "amountMinor" | "settledAmountMinor" | "status">): PersonalLocks {
  const paidMinor = item.settledAmountMinor ?? 0;
  const settled = item.status === "settled";
  return {
    paidMinor,
    amountLocked: settled,
    sideLocked: paidMinor > 0,
    // Equal to what is paid would close it, which is what "Mark settled" is for.
    minAmountMinor: settled ? item.amountMinor : paidMinor > 0 ? paidMinor + 1 : 1,
  };
}

/** Why an amount cannot be saved, or undefined. */
export function personalAmountError(amountMinor: number, locks: PersonalLocks, currency: string): string | undefined {
  if (amountMinor <= 0) return "Enter an amount greater than zero.";
  if (locks.amountLocked) return amountMinor === locks.minAmountMinor ? undefined : "This balance is fully paid, so its amount can't change.";
  if (amountMinor < locks.minAmountMinor) return `It must be more than the ${formatMoney(locks.paidMinor, currency)} already paid.`;
  return undefined;
}

// ---- Receipt photo -------------------------------------------------------------------------------------------------

/** A photo is kept, replaced by a new local image, or removed. `existing` is the signed link of the saved photo. */
export type ReceiptDraft = { existing?: string; local?: string; removed: boolean };

export function receiptDraft(existingUrl?: string): ReceiptDraft {
  return { ...(existingUrl ? { existing: existingUrl } : {}), removed: false };
}

export function withNewReceipt(draft: ReceiptDraft, uri: string): ReceiptDraft {
  return { ...(draft.existing ? { existing: draft.existing } : {}), local: uri, removed: false };
}

export function withoutReceipt(draft: ReceiptDraft): ReceiptDraft {
  return { ...(draft.existing ? { existing: draft.existing } : {}), removed: true };
}

/** What the form shows: the newly chosen photo, else the saved one unless it was removed. */
export function shownReceipt(draft: ReceiptDraft): string | undefined {
  return draft.local ?? (draft.removed ? undefined : draft.existing);
}

/** What to send: `undefined` keeps the saved photo, `null` removes it, a local image uploads and replaces it. */
export function receiptChange(draft: ReceiptDraft): string | null | undefined {
  if (draft.local) return draft.local;
  return draft.removed && draft.existing ? null : undefined;
}

// ---- Filling the expense form from a saved expense ------------------------------------------------------------------

/** An amount the way the form's field takes it: major units, no trailing zeros ("1850", "1850.5"). */
export function minorToInput(minor: number): string {
  return String(Math.round(minor) / 100);
}

/** The typed values of an exact or percentage split, so editing starts from what was saved. Equal splits need none. */
export function allocationsFromShares(method: SplitMethod, shares: ExpenseShare[]): Record<string, string> {
  if (method === "exact") return Object.fromEntries(shares.map((share) => [share.memberId, minorToInput(share.amountMinor)]));
  if (method === "percentage") return Object.fromEntries(shares.map((share) => [share.memberId, String((share.percentageBasisPoints ?? 0) / 100)]));
  return {};
}

// ---- Words ---------------------------------------------------------------------------------------------------------

export function expenseBlockedText(reason: ExpenseDetail["editBlockedReason"]): string {
  return reason === "member_left"
    ? "Someone in this expense has left the group, so it can't be edited. You can delete it and add it again."
    : "Only the person who added or paid this expense can edit it.";
}

export function deleteEntryWarning(item: Pick<TransactionItem, "title" | "currency" | "settledAmountMinor">): string {
  const paid = item.settledAmountMinor ?? 0;
  const payments = paid > 0 ? ` and the ${formatMoney(paid, item.currency)} recorded as paid on it` : "";
  return `This removes "${item.title}"${payments} from your balances. It can't be undone.`;
}

export function deleteExpenseWarning(expenseName: string, groupName: string): string {
  return `This removes "${expenseName}" for everyone in ${groupName}, and their balances change. The group's activity will show that it was deleted. It can't be undone.`;
}
