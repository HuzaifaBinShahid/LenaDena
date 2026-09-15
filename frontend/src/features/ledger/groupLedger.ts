// Pure group ledger helpers for the Groups tab and group detail (D7: selectors.ts is not edited).
// No react-native imports: Vitest runs this file, so any runtime import stays relative (D21).
import type { IconName } from "@/components/ui/Icon";
import type { Group, Plan, TransactionDirection, TransactionItem } from "@/features/ledger/types";

export type GroupExpenseView = {
  sort: "recent" | "largest";
  side: "all" | TransactionDirection;
  type: "all" | "expense" | "payment";
};

export const defaultGroupExpenseView: GroupExpenseView = Object.freeze({ sort: "recent", side: "all", type: "all" });

export type GroupPosition = { tone: "owed" | "owe" | "square" | "new"; label: string; icon: IconName };

/** Group rows keyed by group id, in the order the plan lists them. Personal rows and rows without a group id are skipped. */
export function indexGroupTransactions(plan: Pick<Plan, "transactions">): Map<string, TransactionItem[]> {
  const index = new Map<string, TransactionItem[]>();
  for (const item of plan.transactions) {
    if (item.source !== "group" || !item.groupId) continue;
    const rows = index.get(item.groupId);
    if (rows) rows.push(item);
    else index.set(item.groupId, [item]);
  }
  return index;
}

function compareRecent(a: TransactionItem, b: TransactionItem): number {
  if (a.eventDate !== b.eventDate) return a.eventDate < b.eventDate ? 1 : -1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return 0;
}

function safeAmount(item: TransactionItem): number {
  return Number.isFinite(item.amountMinor) ? Math.abs(item.amountMinor) : 0;
}

/**
 * Filters by side and type, then sorts a copy.
 * recent: eventDate desc, then createdAt desc. largest: amount desc, ties fall back to the recent order.
 * "expense" means every non-payment row (group rows are expenses or payments).
 */
export function getGroupTransactions(items: TransactionItem[], view: GroupExpenseView): TransactionItem[] {
  const rows = items.filter((item) => {
    if (view.side !== "all" && item.direction !== view.side) return false;
    if (view.type === "payment" && item.kind !== "payment") return false;
    if (view.type === "expense" && item.kind === "payment") return false;
    return true;
  });
  return rows.sort(view.sort === "largest"
    ? (a, b) => safeAmount(b) - safeAmount(a) || compareRecent(a, b)
    : compareRecent);
}

/** Direction chip for a group card. Zero is never shown as "owed to you". */
export function groupPosition(group: Pick<Group, "balanceMinor">, hasActivity: boolean): GroupPosition {
  const balance = Number.isFinite(group.balanceMinor) ? group.balanceMinor : 0;
  if (balance > 0) return { tone: "owed", label: "Owed to you", icon: "arrow-down" };
  if (balance < 0) return { tone: "owe", label: "You owe", icon: "arrow-up" };
  return hasActivity
    ? { tone: "square", label: "All square", icon: "check" }
    : { tone: "new", label: "No balance yet", icon: "sparkles" };
}

/** Number of active filters (sort order is not a filter; the chip names it instead). */
export function groupViewFilterCount(view: GroupExpenseView): number {
  return (view.side !== "all" ? 1 : 0) + (view.type !== "all" ? 1 : 0);
}
