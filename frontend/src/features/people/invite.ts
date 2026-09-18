// Invites for People: the share-sheet message and the app download link. Pure (Vitest runs it): no react-native.
import { firstName } from "../../lib/format";

/**
 * Where people get the app while it isn't in the stores: the Loadly page for the Android APK (see
 * scripts/loadly-upload.sh, which prints it). Set EXPO_PUBLIC_APP_DOWNLOAD_URL; Metro inlines it at build time.
 * Only https links count. The API puts it in invite emails only when its host is allowlisted (Loadly, Google Play,
 * the App Store, TestFlight), and its own APP_DOWNLOAD_URL always wins.
 */
export const APP_DOWNLOAD_URL = cleanDownloadUrl(process.env.EXPO_PUBLIC_APP_DOWNLOAD_URL);

/** The trimmed link when it is a plain https URL, else undefined. */
export function cleanDownloadUrl(value: string | undefined | null): string | undefined {
  const url = value?.trim();
  if (!url || url.length > 2000 || !/^https:\/\/[^\s"'<>]+$/i.test(url)) return undefined;
  return url;
}

export type InviteMessageInput = {
  /** The person being invited, as you saved them ("Mani Ahmed" becomes "Mani"). */
  personName?: string | undefined;
  /** You: the account's display name. */
  inviterName?: string | undefined;
  downloadUrl?: string | undefined;
};

/** Titles the share sheet (email subject on some targets). */
export function inviteShareTitle(inviterName?: string): string {
  const inviter = firstName(inviterName ?? "");
  return inviter ? `${inviter} invited you to LenaDena` : "You're invited to LenaDena";
}

/**
 * The message the share sheet sends (WhatsApp, SMS, email…), e.g.
 *
 *   Hi Mani! 👋
 *
 *   Huzaifa invited you to LenaDena — the app we use to keep track of what we owe each other. It never moves
 *   money; it just keeps the tab clear for both of us.
 *
 *   📲 Get the Android app: https://i.loadly.io/…
 *
 *   See you there!
 *
 * First names only. Without a link it asks them to get it from you instead of printing an empty line.
 */
export function buildInviteMessage({ personName, inviterName, downloadUrl }: InviteMessageInput): string {
  const person = firstName(personName ?? "");
  const inviter = firstName(inviterName ?? "");
  const link = cleanDownloadUrl(downloadUrl);
  const greeting = person ? `Hi ${person}! 👋` : "Hi! 👋";
  const who = inviter ? `${inviter} invited you` : "You're invited";
  const pitch = `${who} to LenaDena — the app we use to keep track of what we owe each other. It never moves money; it just keeps the tab clear for both of us.`;
  const getIt = link
    ? `📲 Get the Android app: ${link}`
    : inviter ? `📲 Ask ${inviter} for the app link.` : "📲 Ask me for the app link.";
  return [greeting, pitch, getIt, "See you there!"].join("\n\n");
}
