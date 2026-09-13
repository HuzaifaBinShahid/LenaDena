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
};

export function loadNotificationConfig(): NotificationConfig {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !supabaseSecretKey) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required by the notification worker");
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPassword = process.env.SMTP_PASSWORD;
  const production = process.env.NODE_ENV === "production";
  if (production && !smtpHost) throw new Error("SMTP_HOST is required by the notification worker in production");
  return {
    supabaseUrl,
    supabaseSecretKey,
    ...(smtpHost ? { smtpHost } : {}),
    smtpPort: Number(process.env.SMTP_PORT ?? 587),
    smtpSecure: process.env.SMTP_SECURE === "true",
    ...(smtpUser ? { smtpUser } : {}),
    ...(smtpPassword ? { smtpPassword } : {}),
    smtpFrom: process.env.SMTP_FROM ?? "OweYaar <hello@example.com>",
    intervalMs: Math.max(5000, Number(process.env.NOTIFICATION_INTERVAL_MS ?? 30000)),
    production,
  };
}
