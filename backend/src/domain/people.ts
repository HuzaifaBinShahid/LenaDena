import { DomainError } from "./errors.js";
import type { CreatePersonInput, ReminderFrequency, UpdatePersonInput } from "./types.js";

export const PERSON_NAME_MAX_LENGTH = 80;
export const PERSON_EMAIL_MAX_LENGTH = 254;

// Deliberately basic (name@domain.tld, no spaces): a person's email is contact info, never a sign-in identity.
// supabase/migrations/202609180007_people.sql applies the same pattern.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const URI_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

export class PersonNotFoundError extends DomainError {
  constructor() {
    super("This person is not in your people.", 404, "person_not_found");
  }
}

export class PersonExistsError extends DomainError {
  constructor() {
    super("Someone with this name is already in your people.", 409, "person_exists");
  }
}

/** The database has no People tables or RPCs yet (migration 202609180007 not applied). */
export class PeopleUnavailableError extends DomainError {
  constructor() {
    super("People needs the latest database update (migration 202609180007).", 503, "people_unavailable");
  }
}

export class PersonHasNoEmailError extends DomainError {
  constructor() {
    super("Add an email for this person before emailing them an invite.", 400, "person_has_no_email");
  }
}

export class InviteRecentlySentError extends DomainError {
  constructor() {
    super("An invite already went to this person in the last 12 hours.", 429, "invite_recently_sent");
  }
}

export class EmailRecentlySentError extends DomainError {
  constructor() {
    super("A statement already went to this person in the last 5 minutes.", 429, "email_recently_sent");
  }
}

export class EmailLimitReachedError extends DomainError {
  constructor() {
    super("You've reached today's limit of emails to people. Try again tomorrow.", 429, "email_limit_reached");
  }
}

export class PersonHasNoEntriesError extends DomainError {
  constructor() {
    super("There are no entries with this person yet, so there is nothing to send.", 400, "no_entries");
  }
}

/** Emailing statements and entries needs migration 202611100010 (the older people RPCs are not enough). */
export class EmailUnavailableError extends DomainError {
  constructor() {
    super("Emailing people needs the latest database update (migration 202611100010).", 503, "email_unavailable");
  }
}

/** One emailed invite per person (and per inviter and address) in this window; the SQL function uses the same. */
export const PERSON_INVITE_COOLDOWN_MS = 12 * 60 * 60 * 1000;

/**
 * Hosts a client may suggest as the app download link. Emails carry the link to strangers, so anything else a
 * client sends is dropped rather than mailed (APP_DOWNLOAD_URL on the server always wins).
 */
export const DOWNLOAD_LINK_HOSTS: ReadonlySet<string> = new Set(["i.loadly.io", "loadly.io", "play.google.com", "apps.apple.com", "testflight.apple.com"]);

const MAX_DOWNLOAD_URL_LENGTH = 2000;

/** The URL as a clean https string, or undefined when it isn't a plain https URL without credentials. */
function cleanHttpsUrl(value: string | undefined): URL | undefined {
  const raw = value?.trim();
  if (!raw || raw.length > MAX_DOWNLOAD_URL_LENGTH || /[\s"'<>]/.test(raw)) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return undefined;
    return url;
  } catch {
    return undefined;
  }
}

/** A valid APP_DOWNLOAD_URL setting (any https host: the operator chose it), or undefined. */
export function cleanConfiguredDownloadUrl(value: string | undefined): string | undefined {
  return cleanHttpsUrl(value)?.href;
}

/**
 * The download link an invite email carries: the server's configured link, else the client's suggestion when it
 * is https on an allowlisted host, else none (the email then asks them to get the link from the inviter).
 */
export function resolveInviteDownloadUrl(configured: string | undefined, suggested: string | undefined): string | null {
  const fromConfig = cleanConfiguredDownloadUrl(configured);
  if (fromConfig) return fromConfig;
  const url = cleanHttpsUrl(suggested);
  return url && DOWNLOAD_LINK_HOSTS.has(url.hostname.toLowerCase()) ? url.href : null;
}

/** An email asked for by id must name a transaction (an entry email) or none (a statement). */
export const transactionRequired = () => new DomainError("Choose the entry to email.", 400, "transaction_required");
export const transactionNotFound = () => new DomainError("This entry is not in your history with this person.", 404, "transaction_not_found");
export const invalidReminderFrequency = () => new DomainError("Reminders can be off, weekly or monthly.", 400, "invalid_reminder_frequency");

export const REMINDER_FREQUENCIES: readonly ReminderFrequency[] = ["off", "weekly", "monthly"];

/** Statement cooldown per person, matching app_queue_person_email. */
export const STATEMENT_COOLDOWN_MS = 5 * 60 * 1000;
/** Entries added this close together go out as one email (private.queue_person_email waits 90 seconds). */
export const ENTRY_EMAIL_DELAY_MS = 90 * 1000;
/** Emails an owner can queue to people per rolling day. */
export const DAILY_PERSON_EMAIL_LIMIT = 100;

export const invalidPersonName = () => new DomainError(`Enter a name of 1 to ${PERSON_NAME_MAX_LENGTH} characters.`, 400, "invalid_person_name");
export const invalidPersonEmail = () => new DomainError("Enter a valid email address, or leave it empty.", 400, "invalid_email");
export const invalidAvatarPath = () => new DomainError("This photo can't be used. Upload it again.", 400, "invalid_avatar_path");

/** Two spellings name the same person when they match after trimming, ignoring case. */
export function personNameKey(name: string) {
  return name.trim().toLowerCase();
}

export function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

export function cleanPersonName(value: string) {
  const name = value.trim();
  // Count code points like Postgres char_length and the schema's maxLength, not UTF-16 units.
  const length = Array.from(name).length;
  if (length < 1 || length > PERSON_NAME_MAX_LENGTH) throw invalidPersonName();
  return name;
}

/** A blank email means "no email", so an emptied form field behaves like `null`. */
export function cleanPersonEmail(value: string | null | undefined) {
  const email = value?.trim().toLowerCase() ?? "";
  if (!email) return null;
  if (email.length > PERSON_EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(email)) throw invalidPersonEmail();
  return email;
}

export type AvatarPathOptions = {
  /**
   * Demo (memory) mode has no storage: uploads answer 501 and the client keeps its local image URI,
   * exactly as it does for profile photos. Accept such URIs there; never with real storage.
   */
  allowLocalUri?: boolean;
};

/**
 * Uploads are stored as `<userId>/<uuid>.<ext>` (see storeImage), so a photo path must sit directly in the
 * caller's own folder. Anything else could point at another account's private file.
 */
export function cleanAvatarPath(userId: string, value: string | null | undefined, options: AvatarPathOptions = {}) {
  const path = value?.trim() ?? "";
  if (!path) return null;
  if (options.allowLocalUri && URI_SCHEME_PATTERN.test(path)) return path;
  const segments = path.split("/");
  if (!path.startsWith(`${userId}/`) || segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw invalidAvatarPath();
  }
  return path;
}

export type NewPersonDetails = {
  name: string;
  email: string | null;
  avatarPath: string | null;
};

export function cleanNewPerson(userId: string, input: CreatePersonInput, options: AvatarPathOptions = {}): NewPersonDetails {
  return {
    name: cleanPersonName(input.name),
    email: cleanPersonEmail(input.email),
    avatarPath: cleanAvatarPath(userId, input.avatarPath, options),
  };
}

/** Only the fields present in the request; `null` means clear. */
export type PersonChanges = {
  name?: string;
  email?: string | null;
  avatarPath?: string | null;
  emailUpdates?: boolean;
  reminderFrequency?: ReminderFrequency;
};

export function cleanPersonChanges(userId: string, input: UpdatePersonInput, options: AvatarPathOptions = {}): PersonChanges {
  return {
    ...(input.name !== undefined ? { name: cleanPersonName(input.name) } : {}),
    ...(Object.hasOwn(input, "email") ? { email: cleanPersonEmail(input.email) } : {}),
    ...(Object.hasOwn(input, "avatarPath") ? { avatarPath: cleanAvatarPath(userId, input.avatarPath, options) } : {}),
    ...(typeof input.emailUpdates === "boolean" ? { emailUpdates: input.emailUpdates } : {}),
    ...(input.reminderFrequency !== undefined ? { reminderFrequency: cleanReminderFrequency(input.reminderFrequency) } : {}),
  };
}

export function cleanReminderFrequency(value: string): ReminderFrequency {
  const found = REMINDER_FREQUENCIES.find((item) => item === value);
  if (!found) throw invalidReminderFrequency();
  return found;
}
