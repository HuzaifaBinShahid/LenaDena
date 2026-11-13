// Password rules for sign up, reset and change. Pure (Vitest runs it): no react-native.
//
// Supabase enforces its own minimum length in the dashboard ("Minimum password length"), so these rules are the app's
// side of the same promise: say what is wrong before a request is sent, and never accept what the server would refuse.

export const PASSWORD_MIN_LENGTH = 8;
/** Supabase hashes passwords with bcrypt, which only reads the first 72 bytes: longer ones are refused, not trimmed. */
export const PASSWORD_MAX_BYTES = 72;

export type PasswordIssue = "too_short" | "too_long" | "needs_letter" | "needs_number";

export const PASSWORD_HINT = `At least ${PASSWORD_MIN_LENGTH} characters, with a letter and a number.`;

/** UTF-8 length: an Urdu or emoji password reaches the 72-byte limit sooner than it reaches 72 characters. */
export function utf8Length(value: string): number {
  let bytes = 0;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/** Everything wrong with a password, in the order a person should fix it. Empty means it is fine. */
export function passwordIssues(password: string): PasswordIssue[] {
  const issues: PasswordIssue[] = [];
  if (Array.from(password).length < PASSWORD_MIN_LENGTH) issues.push("too_short");
  if (utf8Length(password) > PASSWORD_MAX_BYTES) issues.push("too_long");
  if (!/\p{L}/u.test(password)) issues.push("needs_letter");
  if (!/\p{Nd}/u.test(password)) issues.push("needs_number");
  return issues;
}

const MESSAGES: Record<PasswordIssue, string> = {
  too_short: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
  too_long: "That password is too long. Use 72 bytes or fewer (about 70 letters).",
  needs_letter: "Add at least one letter.",
  needs_number: "Add at least one number.",
};

/** The first thing to fix, as a sentence; undefined when the password is acceptable. */
export function passwordError(password: string): string | undefined {
  const [first] = passwordIssues(password);
  return first ? MESSAGES[first] : undefined;
}

export type PasswordStrength = "weak" | "okay" | "strong";

/**
 * A rough, honest meter for the sign-up form. It only rewards length and variety, which is what actually slows
 * guessing down; it does not pretend to know which passwords are common.
 */
export function passwordStrength(password: string): PasswordStrength {
  if (passwordIssues(password).length > 0) return "weak";
  const length = Array.from(password).length;
  const classes = [/\p{Ll}/u, /\p{Lu}/u, /\p{Nd}/u, /[^\p{L}\p{Nd}]/u].filter((pattern) => pattern.test(password)).length;
  if (length >= 14 || (length >= 10 && classes >= 3)) return "strong";
  return "okay";
}

/** The same sentence everywhere, so a mismatch on "confirm" reads like the rest of the form. */
export const PASSWORDS_DIFFER = "The two passwords don't match.";
