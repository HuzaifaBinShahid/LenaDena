import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";
import { loadNotificationConfig } from "./notifications/config.js";
import { loadEmailLogo } from "./notifications/logo.js";
import { renderNotification } from "./notifications/templates.js";

type ClaimedNotification = {
  id: string;
  eventType: string;
  recipientEmail: string;
  recipientName: string;
  groupName: string;
  tone: "friendly" | "cheeky" | "chaos" | "quiet";
  payload: Record<string, unknown>;
};

const config = loadNotificationConfig();
const workerId = randomUUID();
// Loaded once: EMAIL_LOGO_URL, or the bundled PNG as an inline CID attachment. A missing file only drops the image.
const logo = loadEmailLogo(config.emailLogoUrl);
if (!logo.src) process.stderr.write("email-logo.png not found; emails will show the LenaDena wordmark without the logo\n");
const renderOptions = { ...(logo.src ? { logoSrc: logo.src } : {}), ...(config.emailLinkBaseUrl ? { linkBaseUrl: config.emailLinkBaseUrl } : {}) };
const supabase = createClient(config.supabaseUrl, config.supabaseSecretKey, { auth: { autoRefreshToken: false, persistSession: false } });
const mailer = config.smtpHost
  ? nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      ...((config.smtpUser && config.smtpPassword) ? { auth: { user: config.smtpUser, pass: config.smtpPassword } } : {}),
    })
  : nodemailer.createTransport({ jsonTransport: true });

/**
 * Marks a claimed row sent (`error` omitted) or failed (retried in five minutes). Goes through
 * `app_finish_notification` because the service role has no table privileges on the hosted project;
 * falls back to a direct update only on a database without that function (before migration 202609180007).
 */
async function finish(id: string, error?: string) {
  const { error: rpcError } = await supabase.rpc("app_finish_notification", { p_id: id, p_worker: workerId, ...(error === undefined ? {} : { p_error: error.slice(0, 1000) }) });
  if (!rpcError) return;
  if (rpcError.code !== "PGRST202" && rpcError.code !== "42883") throw rpcError;
  const values = error === undefined
    ? { sent_at: new Date().toISOString(), locked_at: null, locked_by: null, last_error: null }
    : { locked_at: null, locked_by: null, last_error: error.slice(0, 1000), available_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() };
  const { error: updateError } = await supabase.from("notification_outbox").update(values).eq("id", id).eq("locked_by", workerId);
  if (updateError) throw updateError;
}

async function runBatch() {
  await supabase.rpc("app_enqueue_due_reminders");
  const { data, error } = await supabase.rpc("app_claim_notifications", { p_worker: workerId, p_limit: 25 });
  if (error) throw error;
  for (const item of (data ?? []) as ClaimedNotification[]) {
    try {
      if (!(item.tone === "quiet" && item.eventType === "debt_reminder")) {
        const message = renderNotification(item, renderOptions);
        const result = await mailer.sendMail({ from: config.smtpFrom, to: item.recipientEmail, ...message, attachments: logo.attachments.map((attachment) => ({ ...attachment })) });
        // Without SMTP the JSON transport only logs; skip the message body and base64 logo.
        if (!config.smtpHost) process.stdout.write(`${JSON.stringify({ messageId: result.messageId, envelope: result.envelope, subject: message.subject })}\n`);
      }
      await finish(item.id);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      await finish(item.id, message);
    }
  }
}

async function main() {
  for (;;) {
    try {
      await runBatch();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      process.stderr.write(`${message}\n`);
    }
    await new Promise((resolve) => setTimeout(resolve, config.intervalMs));
  }
}

void main();
