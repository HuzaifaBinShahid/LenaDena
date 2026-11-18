import { cleanConfiguredDownloadUrl } from "./domain/people.js";
import { parseFirebaseCredentials, type FirebaseCredentials } from "./push/fcm.js";

export type AppConfig = {
  nodeEnv: "development" | "test" | "production";
  host: string;
  port: number;
  corsOrigin: string;
  authMode: "demo" | "supabase";
  supabaseUrl?: string;
  supabasePublishableKey?: string;
  supabaseSecretKey?: string;
  /** Server-only Deepgram token used by the optional voice-entry endpoint. Never expose this to Expo. */
  deepgramApiKey?: string;
  /** https link to install the app (APP_DOWNLOAD_URL), put in person invite emails; overrides any link a client suggests. */
  appDownloadUrl?: string;
  /**
   * Shared secret for POST /internal/notifications/run, the hosted email worker pass that a scheduler calls every
   * minute. Unset means the endpoint does not exist. At least 32 characters; never exposed to the app.
   */
  notificationsCronSecret?: string;
  /** Public contact address on the privacy policy and account deletion pages (SUPPORT_EMAIL). Unset shows no address. */
  supportEmail?: string;
  /** Who runs the app, as named on those pages (OPERATOR_NAME). Unset reads "the LenaDena team". */
  operatorName?: string;
  /**
   * Firebase service account for push notifications, from FIREBASE_SERVICE_ACCOUNT_JSON (the key file's JSON, or that
   * JSON in base64). Unset means pushes are off: the app falls back to sharing a message. Server-only, never exposed.
   */
  firebase?: FirebaseCredentials;
  /** FIREBASE_SERVICE_ACCOUNT_JSON is set but is not a usable key (app.ts warns in production; pushes stay off). */
  firebaseInvalid?: boolean;
  /**
   * A request at least this many milliseconds slow is logged as a warning with the calls that took the time
   * (SLOW_REQUEST_MS, default 1500, at least 100). Vercel stops a function after 10 seconds on the free plan.
   */
  slowRequestMs: number;
};

const DEFAULT_SLOW_REQUEST_MS = 1500;

/** The same loose shape the app uses for typed addresses: no spaces or markup characters, one @, a dot in the domain. */
const emailAddress = /^[^\s@<>"'`]+@[^\s@<>"'`]+\.[^\s@<>"'`]+$/;

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const nodeEnv = overrides.nodeEnv ?? (process.env.NODE_ENV === "production" ? "production" : process.env.NODE_ENV === "test" ? "test" : "development");
  const authMode = overrides.authMode ?? (process.env.AUTH_MODE === "supabase" ? "supabase" : "demo");
  const supabaseUrl = overrides.supabaseUrl ?? process.env.SUPABASE_URL;
  const supabasePublishableKey = overrides.supabasePublishableKey ?? process.env.SUPABASE_PUBLISHABLE_KEY;
  const supabaseSecretKey = overrides.supabaseSecretKey ?? process.env.SUPABASE_SECRET_KEY;
  const deepgramApiKey = overrides.deepgramApiKey ?? process.env.DEEPGRAM_API_KEY?.trim();
  const rawDownloadUrl = (overrides.appDownloadUrl ?? process.env.APP_DOWNLOAD_URL)?.trim();
  const appDownloadUrl = rawDownloadUrl ? cleanConfiguredDownloadUrl(rawDownloadUrl) : undefined;
  if (rawDownloadUrl && !appDownloadUrl) throw new Error("APP_DOWNLOAD_URL must be an https URL");
  const notificationsCronSecret = (overrides.notificationsCronSecret ?? process.env.NOTIFICATIONS_CRON_SECRET)?.trim();
  if (notificationsCronSecret && notificationsCronSecret.length < 32) throw new Error("NOTIFICATIONS_CRON_SECRET must be at least 32 characters");
  // These two only decorate public pages, so a typo must never stop the API from starting: an address that is not
  // one counts as unset (app.ts logs a warning in production) and an over-long name is cut.
  const rawSupportEmail = (overrides.supportEmail ?? process.env.SUPPORT_EMAIL)?.trim();
  const supportEmail = rawSupportEmail && rawSupportEmail.length <= 254 && emailAddress.test(rawSupportEmail) ? rawSupportEmail : undefined;
  const operatorName = (overrides.operatorName ?? process.env.OPERATOR_NAME)?.trim().slice(0, 80);
  // Like the two above, a bad value must never stop the API from starting: pushes simply stay off.
  const rawFirebase = overrides.firebase ? undefined : process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  const firebase = overrides.firebase ?? parseFirebaseCredentials(rawFirebase);
  // A threshold is only a logging aid, so a bad value falls back to the default instead of stopping the API.
  const rawSlow = Number(overrides.slowRequestMs ?? process.env.SLOW_REQUEST_MS);
  const slowRequestMs = Number.isFinite(rawSlow) && rawSlow >= 100 ? Math.round(rawSlow) : DEFAULT_SLOW_REQUEST_MS;
  const config: AppConfig = {
    nodeEnv,
    slowRequestMs,
    host: overrides.host ?? process.env.HOST ?? "0.0.0.0",
    port: overrides.port ?? Number(process.env.PORT || 3000),
    corsOrigin: overrides.corsOrigin ?? process.env.CORS_ORIGIN ?? "*",
    authMode,
    ...(supabaseUrl ? { supabaseUrl } : {}),
    ...(supabasePublishableKey ? { supabasePublishableKey } : {}),
    ...(supabaseSecretKey ? { supabaseSecretKey } : {}),
    ...(deepgramApiKey ? { deepgramApiKey } : {}),
    ...(appDownloadUrl ? { appDownloadUrl } : {}),
    ...(notificationsCronSecret ? { notificationsCronSecret } : {}),
    ...(supportEmail ? { supportEmail } : {}),
    ...(operatorName ? { operatorName } : {}),
    ...(firebase ? { firebase } : {}),
    ...(rawFirebase && !firebase ? { firebaseInvalid: true } : {}),
  };
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  if (config.authMode === "supabase" && (!config.supabaseUrl || !config.supabaseSecretKey)) {
    throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required in supabase mode");
  }
  return config;
}
