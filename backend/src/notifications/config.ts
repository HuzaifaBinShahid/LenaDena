export type NotificationConfig = {
  supabaseUrl: string;
  supabaseSecretKey: string;
  smtpHost?: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser?: string;
  smtpPassword?: string;
  smtpFrom: string;
  intervalMs: number;
  production: boolean;
  /** Hosted logo image; when unset the worker embeds src/notifications/assets/email-logo.png inline (CID). */
  emailLogoUrl?: string;
  /** Web origin for email buttons instead of lenadena:// (Gmail removes links with custom schemes). */
  emailLinkBaseUrl?: string;
};

function optionalHttpUrl(name: string, { trimTrailingSlash = false } = {}): string | undefined {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute http(s) URL`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error(`${name} must be an absolute http(s) URL`);
  return trimTrailingSlash ? value.replace(/\/+$/, "") : value;
}

export function loadNotificationConfig(): NotificationConfig {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !supabaseSecretKey) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required by the notification worker");
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPassword = process.env.SMTP_PASSWORD;
  const production = process.env.NODE_ENV === "production";
  if (production && !smtpHost) throw new Error("SMTP_HOST is required by the notification worker in production");
  const emailLogoUrl = optionalHttpUrl("EMAIL_LOGO_URL");
  const emailLinkBaseUrl = optionalHttpUrl("EMAIL_LINK_BASE_URL", { trimTrailingSlash: true });
  return {
    supabaseUrl,
    supabaseSecretKey,
    ...(smtpHost ? { smtpHost } : {}),
    smtpPort: Number(process.env.SMTP_PORT ?? 587),
    smtpSecure: process.env.SMTP_SECURE === "true",
    ...(smtpUser ? { smtpUser } : {}),
    ...(smtpPassword ? { smtpPassword } : {}),
    smtpFrom: process.env.SMTP_FROM ?? "LenaDena <hello@example.com>",
    intervalMs: Math.max(5000, Number(process.env.NOTIFICATION_INTERVAL_MS ?? 30000)),
    production,
    ...(emailLogoUrl ? { emailLogoUrl } : {}),
    ...(emailLinkBaseUrl ? { emailLinkBaseUrl } : {}),
  };
}
