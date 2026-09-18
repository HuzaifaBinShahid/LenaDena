import { DomainError } from "./errors.js";
import type { CreatePersonInput, UpdatePersonInput } from "./types.js";

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
};

export function cleanPersonChanges(userId: string, input: UpdatePersonInput, options: AvatarPathOptions = {}): PersonChanges {
  return {
    ...(input.name !== undefined ? { name: cleanPersonName(input.name) } : {}),
    ...(Object.hasOwn(input, "email") ? { email: cleanPersonEmail(input.email) } : {}),
    ...(Object.hasOwn(input, "avatarPath") ? { avatarPath: cleanAvatarPath(userId, input.avatarPath, options) } : {}),
  };
}
