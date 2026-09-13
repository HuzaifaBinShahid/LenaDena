import type { Plan } from "@/features/ledger/types";

export function getOpenBalanceTotals(plan: Pick<Plan, "totals" | "transactions">) {
  const values = new Map<string, { owedMinor: number; oweMinor: number }>();
  for (const total of plan.totals) values.set(total.currency, { owedMinor: total.owedMinor, oweMinor: total.oweMinor });
  for (const item of plan.transactions) {
    if (item.source !== "personal" || item.status === "settled") continue;
    const current = values.get(item.currency) ?? { owedMinor: 0, oweMinor: 0 };
    if (item.direction === "incoming") current.owedMinor += item.amountMinor;
    if (item.direction === "outgoing") current.oweMinor += item.amountMinor;
    values.set(item.currency, current);
  }
  return Array.from(values, ([currency, total]) => ({ currency, ...total })).sort((left, right) => left.currency.localeCompare(right.currency));
}
