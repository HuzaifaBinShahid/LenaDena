import type { SendMailOptions } from "nodemailer";
import { describe, expect, it } from "vitest";
import type { NotificationConfig } from "./config.js";
import { createNotificationRunner } from "./runner.js";

const config: NotificationConfig = {
  supabaseUrl: "http://127.0.0.1:1",
  supabaseSecretKey: "test-secret",
  smtpHost: "smtp.example.com",
  smtpPort: 587,
  smtpSecure: false,
  smtpFrom: "LenaDena <hello@example.com>",
  intervalMs: 30000,
  production: false,
  // A hosted logo, so the runner does not look for the bundled PNG.
  emailLogoUrl: "https://example.com/logo.png",
  groupDebtReminders: false,
};

const row = (overrides: Record<string, unknown> = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  eventType: "expense_added",
  recipientEmail: "sara@example.com",
  recipientName: "Sara",
  groupName: "Weekend crew",
  tone: "friendly",
  payload: {},
  ...overrides,
});

function setup(rows: unknown[], options: { sendFails?: string; person?: { code?: string; message: string } } = {}) {
  const calls: Array<{ name: string; args: Record<string, unknown> | undefined }> = [];
  const sent: SendMailOptions[] = [];
  const warnings: string[] = [];
  const client = {
    rpc: async (name: string, args?: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "app_claim_notifications") return { data: rows, error: null };
      if (name === "app_enqueue_person_reminders" && options.person) return { data: null, error: options.person };
      return { data: null, error: null };
    },
  };
  const mailer = {
    sendMail: async (message: SendMailOptions) => {
      if (options.sendFails) throw new Error(options.sendFails);
      sent.push(message);
      return { messageId: "message-1" };
    },
  };
  return { calls, sent, warnings, runner: createNotificationRunner(config, { client, mailer, warn: (message) => warnings.push(message), log: () => undefined }) };
}

const names = (calls: Array<{ name: string }>) => calls.map((call) => call.name);

describe("notification runner", () => {
  it("does not queue the automatic group-debt reminders unless they are switched on", async () => {
    const off = setup([]);
    await off.runner.runBatch();
    expect(names(off.calls)).toEqual(["app_enqueue_person_reminders", "app_claim_notifications"]);

    const calls: string[] = [];
    const on = createNotificationRunner({ ...config, groupDebtReminders: true }, {
      client: { rpc: async (name: string) => { calls.push(name); return { data: name === "app_claim_notifications" ? [] : null, error: null }; } },
      mailer: { sendMail: async () => ({}) },
      warn: () => undefined,
    });
    await on.runBatch();
    expect(calls).toEqual(["app_enqueue_due_reminders", "app_enqueue_person_reminders", "app_claim_notifications"]);
  });

  it("always queues the reminders an owner chose for a person, and ignores a database without them", async () => {
    const without = setup([], { person: { code: "PGRST202", message: "missing" } });
    await expect(without.runner.runBatch()).resolves.toEqual({ claimed: 0, sent: 0, failed: 0, skipped: 0 });
    const broken = setup([], { person: { code: "XX000", message: "boom" } });
    await expect(broken.runner.runBatch()).rejects.toThrow("boom");
  });

  it("sends each claimed email, marks it done, and counts it", async () => {
    const { runner, sent, calls } = setup([row()]);
    await expect(runner.runBatch({ limit: 3 })).resolves.toEqual({ claimed: 1, sent: 1, failed: 0, skipped: 0 });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ from: "LenaDena <hello@example.com>", to: "sara@example.com" });
    expect(calls.find((call) => call.name === "app_claim_notifications")?.args).toMatchObject({ p_limit: 3 });
    const finished = calls.find((call) => call.name === "app_finish_notification");
    expect(finished?.args).toMatchObject({ p_id: "11111111-1111-4111-8111-111111111111" });
    expect(finished?.args).not.toHaveProperty("p_error");
  });

  it("keeps a failed email for a retry instead of losing it", async () => {
    const { runner, calls } = setup([row()], { sendFails: "connection refused" });
    await expect(runner.runBatch()).resolves.toEqual({ claimed: 1, sent: 0, failed: 1, skipped: 0 });
    expect(calls.find((call) => call.name === "app_finish_notification")?.args).toMatchObject({ p_error: "connection refused" });
  });

  it("closes a quiet person's debt reminder without sending it", async () => {
    const { runner, sent, calls } = setup([row({ eventType: "debt_reminder", tone: "quiet" })]);
    await expect(runner.runBatch()).resolves.toEqual({ claimed: 1, sent: 0, failed: 0, skipped: 1 });
    expect(sent).toHaveLength(0);
    expect(names(calls)).toContain("app_finish_notification");
  });

  it("asks for a sensible number of rows", async () => {
    const small = setup([]);
    await small.runner.runBatch({ limit: 0 });
    expect(small.calls.find((call) => call.name === "app_claim_notifications")?.args).toMatchObject({ p_limit: 1 });
    const large = setup([]);
    await large.runner.runBatch({ limit: 5000 });
    expect(large.calls.find((call) => call.name === "app_claim_notifications")?.args).toMatchObject({ p_limit: 100 });
  });
});
