// Pure loading / offline / empty detection for the home tabs (D19). No react-native imports: Vitest runs this file.
import type { Plan } from "@/features/ledger/types";

export type Connection = "loading" | "live" | "demo" | "error";
export type PlanState = "loading" | "offline" | "empty" | "ready";

const NEW_ACCOUNT_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * "loading" / "offline" only while the placeholder plan (user id "loading") is showing.
 * A plan that loaded once and then failed to refresh stays "ready" or "empty"; only the header pill says Offline.
 */
export function getPlanState(plan: Plan, connection: Connection): PlanState {
  if (plan.user.id === "loading") return connection === "error" ? "offline" : "loading";
  const hasOpenTotal = plan.totals.some((total) => total.oweMinor !== 0 || total.owedMinor !== 0);
  const hasData =
    plan.groups.length > 0 ||
    plan.transactions.length > 0 ||
    plan.reviews.length > 0 ||
    plan.claims.length > 0 ||
    hasOpenTotal;
  return hasData ? "ready" : "empty";
}

/** True when the profile has no usable `createdAt`, or it is less than 7 days old. */
export function isNewAccount(plan: Plan, now: number = Date.now()): boolean {
  const createdAt = plan.user.createdAt;
  if (!createdAt) return true;
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return true;
  return now - created < NEW_ACCOUNT_MS;
}
