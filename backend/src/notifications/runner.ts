import { randomUUID } from "node:crypto";
import nodemailer, { type SendMailOptions } from "nodemailer";
import { createClient } from "@supabase/supabase-js";
import type { NotificationConfig } from "./config.js";
import { loadEmailLogo } from "./logo.js";
import { personMailExtras } from "./person-mail.js";
import { renderNotification } from "./templates.js";

type ClaimedNotification = {
  id: string;
  eventType: string;
  recipientEmail: string;
  recipientName: string;
  groupName: string;
  tone: "friendly" | "cheeky" | "chaos" | "quiet";
  payload: Record<string, unknown>;
};

export type BatchResult = {
  /** Rows taken from the outbox this pass. */
  claimed: number;
  sent: number;
  /** Rows that errored and will be retried in five minutes. */
  failed: number;
  /** Rows closed without an email (a "quiet" tone asked not to be reminded). */
  skipped: number;
};

export type NotificationRunner = {
  /** One pass: queue any reminders that are due, then send up to `limit` queued emails. */
  runBatch(options?: { limit?: number }): Promise<BatchResult>;
};

type Mailer = { sendMail: (message: SendMailOptions) => Promise<{ messageId?: string; envelope?: unknown }> };

/** What the runner needs from Supabase and the mail server; tests pass stand-ins. */
export type RunnerDeps = {
  client?: { rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }> };
  mailer?: Mailer;
  /** Reports problems and, without SMTP, what would have been sent. Defaults to stderr/stdout. */
  warn?: (message: string) => void;
  log?: (message: string) => void;
};

/**
 * Sends what is waiting in the notification outbox. The same code runs as the long-lived worker (`worker.ts`, a loop)
 * and as one scheduled pass on the hosted API (`POST /internal/notifications/run`). Rows are claimed with a lock, so
 * overlapping passes never send the same email twice.
 *
 * LenaDena only emails people it was asked to. The reminders it queues by itself are the ones an owner switched on
 * for a person (weekly or monthly, off by default); the older automatic group-debt reminders stay off unless
 * `ENABLE_GROUP_DEBT_REMINDERS=true`.
 */
export function createNotificationRunner(config: NotificationConfig, deps: RunnerDeps = {}): NotificationRunner {
  const workerId = randomUUID();
  const warn = deps.warn ?? ((message: string) => void process.stderr.write(`${message}\n`));
  const log = deps.log ?? ((message: string) => void process.stdout.write(`${message}\n`));
  // Loaded once: EMAIL_LOGO_URL, or the bundled PNG as an inline CID attachment. A missing file only drops the image.
  const logo = loadEmailLogo(config.emailLogoUrl);
  if (!logo.src) warn("email-logo.png not found; emails will show the LenaDena wordmark without the logo");
  const renderOptions = { ...(logo.src ? { logoSrc: logo.src } : {}), ...(config.emailLinkBaseUrl ? { linkBaseUrl: config.emailLinkBaseUrl } : {}) };
  const client = deps.client ?? createClient(config.supabaseUrl, config.supabaseSecretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const mailer: Mailer = deps.mailer ?? (config.smtpHost
    ? nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpSecure,
        ...((config.smtpUser && config.smtpPassword) ? { auth: { user: config.smtpUser, pass: config.smtpPassword } } : {}),
      })
    : nodemailer.createTransport({ jsonTransport: true })) as Mailer;

  /**
   * Marks a claimed row sent (`error` omitted) or failed (retried in five minutes). Goes through
   * `app_finish_notification` because the service role has no table privileges on the hosted project;
   * falls back to a direct update only on a database without that function (before migration 202609180007).
   */
  async function finish(id: string, error?: string) {
    const { error: rpcError } = await client.rpc("app_finish_notification", { p_id: id, p_worker: workerId, ...(error === undefined ? {} : { p_error: error.slice(0, 1000) }) });
    if (!rpcError) return;
    if (rpcError.code !== "PGRST202" && rpcError.code !== "42883") throw new Error(rpcError.message);
    const values = error === undefined
      ? { sent_at: new Date().toISOString(), locked_at: null, locked_by: null, last_error: null }
      : { locked_at: null, locked_by: null, last_error: error.slice(0, 1000), available_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() };
    const table = (client as unknown as { from: (name: string) => { update: (values: Record<string, unknown>) => { eq: (column: string, value: string) => { eq: (column: string, value: string) => PromiseLike<{ error: { message: string } | null }> } } } }).from("notification_outbox");
    const { error: updateError } = await table.update(values).eq("id", id).eq("locked_by", workerId);
    if (updateError) throw new Error(updateError.message);
  }

  /**
   * Queues this cycle's reminders: the weekly and monthly reminders owners chose for people (migration
   * 202611100010; a database without it simply has none), and, only when switched on, the older group-debt ones.
   */
  async function enqueueReminders() {
    if (config.groupDebtReminders) await client.rpc("app_enqueue_due_reminders");
    const { error } = await client.rpc("app_enqueue_person_reminders");
    if (error && error.code !== "PGRST202" && error.code !== "42883") throw new Error(error.message);
  }

  async function runBatch(options: { limit?: number } = {}): Promise<BatchResult> {
    const result: BatchResult = { claimed: 0, sent: 0, failed: 0, skipped: 0 };
    await enqueueReminders();
    const limit = Math.min(Math.max(Math.trunc(options.limit ?? 25), 1), 100);
    const { data, error } = await client.rpc("app_claim_notifications", { p_worker: workerId, p_limit: limit });
    if (error) throw new Error(error.message);
    for (const item of (data ?? []) as ClaimedNotification[]) {
      result.claimed += 1;
      try {
        if (item.tone === "quiet" && item.eventType === "debt_reminder") {
          result.skipped += 1;
        } else {
          const message = renderNotification(item, renderOptions);
          // Person emails add the owner as Reply-To, and a statement carries its PDF.
          const extras = await personMailExtras(item.eventType, item.payload);
          const sent = await mailer.sendMail({
            from: config.smtpFrom,
            to: item.recipientEmail,
            ...(extras.replyTo ? { replyTo: extras.replyTo } : {}),
            ...message,
            attachments: [...logo.attachments.map((attachment) => ({ ...attachment })), ...extras.attachments],
          });
          // Without SMTP the JSON transport only logs; skip the message body and base64 logo.
          if (!config.smtpHost) log(JSON.stringify({ messageId: sent.messageId, envelope: sent.envelope, subject: message.subject }));
          result.sent += 1;
        }
        await finish(item.id);
      } catch (cause) {
        result.failed += 1;
        const message = cause instanceof Error ? cause.message : String(cause);
        try {
          await finish(item.id, message);
        } catch (finishCause) {
          warn(`Could not mark ${item.id} as failed: ${finishCause instanceof Error ? finishCause.message : String(finishCause)}`);
        }
      }
    }
    return result;
  }

  return { runBatch };
}
