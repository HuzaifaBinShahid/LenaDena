import { DomainError } from "./errors.js";
import type { ExpenseShare, SplitMethod } from "./types.js";

export function validateShares(amountMinor: number, method: SplitMethod, shares: ExpenseShare[]) {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new DomainError("Amount must be a positive integer in minor units");
  }
  if (!shares.length) {
    throw new DomainError("At least one participant is required");
  }
  const ids = new Set(shares.map((share) => share.memberId));
  if (ids.size !== shares.length) {
    throw new DomainError("A participant can appear only once");
  }
  if (shares.some((share) => !Number.isSafeInteger(share.amountMinor) || share.amountMinor < 0)) {
    throw new DomainError("Every share must use non-negative integer minor units");
  }
  const total = shares.reduce((sum, share) => sum + share.amountMinor, 0);
  if (total !== amountMinor) {
    throw new DomainError("Shares must add up exactly to the expense amount");
  }
  if (method === "percentage") {
    const basisPoints = shares.reduce((sum, share) => sum + (share.percentageBasisPoints ?? 0), 0);
    if (basisPoints !== 10000) {
      throw new DomainError("Percentage shares must add up to 100 percent");
    }
  }
}

export function pairKey(debtorId: string, recipientId: string) {
  return `${debtorId}:${recipientId}`;
}
