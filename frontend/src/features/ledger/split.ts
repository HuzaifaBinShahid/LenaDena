import type { ExpenseShare, SplitMethod } from "./types";
import { toMinorUnits } from "../../lib/format";

export function calculateShares(amountMinor: number, memberIds: string[], method: SplitMethod, allocations: Record<string, string>): ExpenseShare[] {
  if (!amountMinor || !memberIds.length) return [];
  if (method === "equal") {
    const base = Math.floor(amountMinor / memberIds.length);
    const remainder = amountMinor - base * memberIds.length;
    return memberIds.map((memberId, index) => ({ memberId, amountMinor: base + (index < remainder ? 1 : 0) }));
  }
  if (method === "exact") {
    return memberIds.map((memberId) => ({ memberId, amountMinor: toMinorUnits(allocations[memberId] ?? "") }));
  }
  const values = memberIds.map((memberId) => {
    const percentageBasisPoints = Math.round(Number(allocations[memberId] ?? 0) * 100);
    const rawAmount = amountMinor * percentageBasisPoints / 10000;
    return { memberId, percentageBasisPoints, rawAmount, amountMinor: Math.floor(rawAmount) };
  });
  let remainder = amountMinor - values.reduce((sum, value) => sum + value.amountMinor, 0);
  const order = values.map((value, index) => ({ index, fraction: value.rawAmount - value.amountMinor })).sort((a, b) => b.fraction - a.fraction);
  for (let index = 0; index < remainder && order.length; index += 1) {
    const target = order[index % order.length];
    if (target) values[target.index]!.amountMinor += 1;
  }
  return values.map(({ memberId, amountMinor: value, percentageBasisPoints }) => ({ memberId, amountMinor: value, percentageBasisPoints }));
}
