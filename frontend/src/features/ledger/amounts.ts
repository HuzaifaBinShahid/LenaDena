// Money still owed on one entry. A settled entry (or older data without a paid figure) counts as fully paid, so
// every screen can show the same remaining amount without knowing how the database stores it.
import { toMinorUnits } from "../../lib/format";
import type { TransactionItem } from "./types";

type SettleableItem = Pick<TransactionItem, "amountMinor" | "settledAmountMinor" | "status">;

function amountOf(item: SettleableItem): number {
  return Number.isFinite(item.amountMinor) ? Math.max(0, item.amountMinor) : 0;
}

/** How much of the entry has been paid. Settled rows are paid in full even when the server omits the field. */
export function settledAmountOf(item: SettleableItem): number {
  const amount = amountOf(item);
  if (item.status === "settled") return amount;
  const paid = item.settledAmountMinor;
  if (!Number.isFinite(paid)) return 0;
  return Math.min(amount, Math.max(0, paid as number));
}

/** What still counts against a balance. Zero for a fully settled entry. */
export function remainingAmountOf(item: SettleableItem): number {
  return Math.max(0, amountOf(item) - settledAmountOf(item));
}

/** True for an open entry that has taken some money but still has a remainder. */
export function isPartiallySettled(item: SettleableItem): boolean {
  return item.status !== "settled" && settledAmountOf(item) > 0 && remainingAmountOf(item) > 0;
}

/** What a typed "custom payment" amount means for one entry, so the modal and its tests share one set of rules. */
export type CustomPayment = {
  /** The typed amount in minor units; 0 while the field is empty or unreadable. */
  amountMinor: number;
  /** Ready to save: more than zero and no more than what is still open. */
  valid: boolean;
  /** The amount covers everything still open, so saving it settles the entry. */
  settlesInFull: boolean;
  /** What stays open after this payment; the whole remainder until a valid amount is typed. */
  leftMinor: number;
  /** Shown only once the person has typed something that cannot be saved. */
  error?: string;
};

export function describeCustomPayment(text: string, remainingMinor: number): CustomPayment {
  const remaining = Math.max(0, remainingMinor);
  const amountMinor = toMinorUnits(text);
  const valid = amountMinor > 0 && amountMinor <= remaining;
  const typed = text.trim().length > 0;
  const error = typed && amountMinor <= 0
    ? "Enter an amount greater than zero."
    : amountMinor > remaining
      ? "That is more than what is still open."
      : undefined;
  return {
    amountMinor,
    valid,
    settlesInFull: valid && amountMinor === remaining,
    leftMinor: valid ? remaining - amountMinor : remaining,
    ...(error ? { error } : {}),
  };
}
