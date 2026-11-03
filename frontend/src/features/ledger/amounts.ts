// Money still owed on one entry. A settled entry (or older data without a paid figure) counts as fully paid, so
// every screen can show the same remaining amount without knowing how the database stores it.
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
