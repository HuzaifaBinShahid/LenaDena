import { DomainError } from "./errors.js";

/** How recently the person must have typed their password for the API to delete their account. */
export const RECENT_SIGN_IN_SECONDS = 10 * 60;

export class RecentSignInRequiredError extends DomainError {
  constructor() {
    super("Enter your password again to delete your account.", 403, "recent_sign_in_required");
  }
}

export class AccountDeletionUnavailableError extends DomainError {
  constructor() {
    super("Deleting accounts needs the latest database update (migration 202611160012).", 503, "account_deletion_unavailable");
  }
}

export class AccountDeletionFailedError extends DomainError {
  constructor(message = "We couldn't finish deleting your account. Nothing more was changed; please try again.") {
    super(message, 500, "account_deletion_failed");
  }
}

/** True when `passwordSignInAt` (unix seconds) is a password sign-in from the last few minutes and not from the future. */
export function isRecentPasswordSignIn(passwordSignInAt: number | undefined, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  if (passwordSignInAt === undefined || !Number.isFinite(passwordSignInAt)) return false;
  return passwordSignInAt <= nowSeconds + 60 && nowSeconds - passwordSignInAt <= RECENT_SIGN_IN_SECONDS;
}

/**
 * Keeps only storage paths inside the person's own folder (`<id>/...`), so a stray or hand-edited path can never make
 * the deletion remove someone else's file.
 */
export function ownStoragePaths(value: unknown, userId: string): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && item.startsWith(`${userId}/`) && !item.split("/").includes("..")))];
}
