// Rules and wording for deleting an account. Pure (Vitest runs it): no react-native.

/** What the person types to confirm. The API checks the exact word again. */
export const DELETE_WORD = "DELETE";

/** Typing is forgiving about case and surrounding spaces, so a phone's auto-capitalisation never blocks it. */
export function isDeleteWord(typed: string): boolean {
  return typed.trim().toUpperCase() === DELETE_WORD;
}

export type DeleteErrorCopy = { title: string; message: string };

type ErrorShape = { status?: unknown; code?: unknown; message?: unknown };

/** Friendly words for what the API can answer to a deletion. Reads the error's shape, so it needs no import of the client. */
export function describeDeleteError(error: unknown): DeleteErrorCopy {
  const { status, code, message } = (error ?? {}) as ErrorShape;
  const title = "Couldn't delete your account";
  if (code === "recent_sign_in_required") return { title, message: "Enter your password again and try once more." };
  if (code === "account_deletion_unavailable") return { title, message: "Deleting accounts isn't switched on for this server yet. Please try again later." };
  if (status === 429) return { title: "Too many attempts", message: "Wait a minute before trying again." };
  if (code === "account_deletion_failed" && typeof message === "string" && message) return { title, message };
  if (error instanceof TypeError) return { title, message: "LenaDena can't reach its server. Check your connection and try again." };
  return { title, message: "Something went wrong, and your account may not be deleted. Please try again." };
}
