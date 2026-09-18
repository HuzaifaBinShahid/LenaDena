/**
 * Writes HTML previews of every notification email (each event in each tone) and every Supabase
 * auth template to backend/.email-preview/ (gitignored), with index.html linking them all.
 *
 *   pnpm --filter @lenadena/backend preview:emails
 */
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fillAuthPlaceholders, readAuthTemplates } from "./auth-templates.js";
import { escapeHtml } from "./format.js";
import { renderGoTemplate } from "./go-template.js";
import { findEmailLogoFile } from "./logo.js";
import { emailTones, notificationEventTypes, renderNotification, type NotificationInput } from "./templates.js";

const outDir = fileURLToPath(new URL("../../.email-preview/", import.meta.url));
const LOGO = "email-logo.png";

type Sample = Omit<NotificationInput, "tone">;

/** Payloads shaped exactly like today's outbox rows, so the previews show what people will receive. */
const samples: Record<(typeof notificationEventTypes)[number], Sample> = {
  group_invite: { eventType: "group_invite", recipientName: "Friend", recipientEmail: "ali@example.com", groupName: "Weekend crew", payload: { url: "lenadena://invite/9c1f4e2ab7d04c6f8e3a1b5d7c9e0f2a4b6c8d0e1f3a5b7c" } },
  expense_added: { eventType: "expense_added", recipientName: "Sara Khan", recipientEmail: "sara@example.com", groupName: "Weekend crew", payload: { expenseId: "0b7c1d2e-3f40-4a5b-8c6d-7e8f9a0b1c2d", eventName: "Dinner at Kolachi", amountMinor: 240000, currency: "PKR" } },
  debt_reminder: { eventType: "debt_reminder", recipientName: "Sara Khan", recipientEmail: "sara@example.com", groupName: "Weekend crew", payload: { amountMinor: 185000, currency: "PKR", recipientId: "5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d" } },
  payment_claimed: { eventType: "payment_claimed", recipientName: "Sara Khan", recipientEmail: "sara@example.com", groupName: "Weekend crew", payload: { settlementId: "d4c3b2a1-0f9e-4d8c-8b7a-6f5e4d3c2b1a" } },
  payment_confirmed: { eventType: "payment_confirmed", recipientName: "Ali Raza", recipientEmail: "ali@example.com", groupName: "Weekend crew", payload: { settlementId: "d4c3b2a1-0f9e-4d8c-8b7a-6f5e4d3c2b1a" } },
  payment_self_confirmed: { eventType: "payment_self_confirmed", recipientName: "Sara Khan", recipientEmail: "sara@example.com", groupName: "Weekend crew", payload: { settlementId: "d4c3b2a1-0f9e-4d8c-8b7a-6f5e4d3c2b1a", amountMinor: 350000, currency: "PKR" } },
  payment_needs_attention: { eventType: "payment_needs_attention", recipientName: "Ali Raza", recipientEmail: "ali@example.com", groupName: "Weekend crew", payload: { settlementId: "d4c3b2a1-0f9e-4d8c-8b7a-6f5e4d3c2b1a" } },
};

/** Optional payload fields, long text and hostile input, to check the layout holds up. */
const extras: Array<{ name: string; input: NotificationInput }> = [
  {
    name: "expense_added-all-fields",
    input: { eventType: "expense_added", tone: "friendly", recipientName: "Sara Khan", recipientEmail: "sara@example.com", groupName: "Hunza road trip 2026", payload: { eventName: "Fuel, tolls and a very long chai stop near Karimabad", amountMinor: 1234500, currency: "PKR", actorName: "Ali Raza", eventDate: "2026-09-14", note: "Split evenly between the four of us. Receipt is in the app." } },
  },
  {
    name: "payment_claimed-all-fields-usd",
    input: { eventType: "payment_claimed", tone: "cheeky", recipientName: "Sara Khan", recipientEmail: "sara@example.com", groupName: "Flatmates", payload: { settlementId: "abc", amountMinor: 4550, currency: "USD", actorName: "Ali Raza", note: "Sent through the bank app this morning." } },
  },
  {
    name: "edge-long-and-hostile",
    input: { eventType: "expense_added", tone: "chaos", recipientName: "<b>Mallory</b> O'Brien-Featherstonehaugh", recipientEmail: "mallory.obrien.featherstonehaugh@a-very-long-domain-name.example.com", groupName: "The extraordinarily long group name for the whole extended family & friends <script>", payload: { eventName: "\"><img src=x onerror=alert(1)>", amountMinor: 999999999, currency: "PKR" } },
  },
  {
    name: "edge-no-group-no-amount",
    input: { eventType: "debt_reminder", tone: "friendly", recipientName: "Friend", groupName: "your group", payload: { amountMinor: 5000 } },
  },
  {
    name: "unknown-event",
    input: { eventType: "something_new", tone: "friendly", recipientName: "Sara Khan", groupName: "Weekend crew", payload: {} },
  },
];

const authSample = {
  ConfirmationURL: "https://abcdefghijklmnopqrst.supabase.co/auth/v1/verify?token=4b1f0c5d2e7a9b3c8d6e1f0a2b4c6d8e0f1a3b5c7d9e1f2a3b4c&type=magiclink&redirect_to=lenadena://",
  Token: "482913",
  TokenHash: "4b1f0c5d2e7a9b3c8d6e1f0a2b4c6d8e0f1a3b5c7d9e1f2a3b4c",
  SiteURL: "http://localhost:3000",
  RedirectTo: "lenadena://",
  Email: "sara@example.com",
  NewEmail: "sara.khan@example.org",
  Data: { name: "Sara Khan" },
};

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const logoFile = findEmailLogoFile();
if (logoFile) copyFileSync(logoFile, `${outDir}${LOGO}`);

type Entry = { group: string; label: string; subject: string; html: string; text?: string };
const entries: Entry[] = [];

for (const eventType of notificationEventTypes) {
  for (const tone of emailTones) {
    const name = `notification-${eventType}-${tone}`;
    const message = renderNotification({ ...samples[eventType], tone }, { logoSrc: LOGO });
    writeFileSync(`${outDir}${name}.html`, message.html);
    writeFileSync(`${outDir}${name}.txt`, message.text);
    entries.push({ group: eventType, label: tone, subject: message.subject, html: `${name}.html`, text: `${name}.txt` });
  }
}

for (const extra of extras) {
  const name = `extra-${extra.name}`;
  const message = renderNotification(extra.input, { logoSrc: LOGO });
  writeFileSync(`${outDir}${name}.html`, message.html);
  writeFileSync(`${outDir}${name}.txt`, message.text);
  entries.push({ group: "Edge cases and optional fields", label: extra.name, subject: message.subject, html: `${name}.html`, text: `${name}.txt` });
}

for (const template of readAuthTemplates()) {
  const filled = fillAuthPlaceholders(template.html, { LOGO_URL: LOGO, EXPIRES_IN: "1 hour" });
  const variants = template.type === "magic_link" || template.type === "confirmation" ? [authSample, { ...authSample, Data: {} }] : [authSample];
  variants.forEach((data, index) => {
    const name = `auth-${template.type}${index === 0 ? "" : "-no-name"}`;
    writeFileSync(`${outDir}${name}.html`, renderGoTemplate(filled, data));
    entries.push({ group: "Supabase Auth", label: `${template.type}${index === 0 ? "" : " (no name)"}`, subject: String(template.subject), html: `${name}.html` });
  });
}

const groups = [...new Set(entries.map((entry) => entry.group))];
const index = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>LenaDena email previews</title>
<style>body{font-family:-apple-system,'Segoe UI',Roboto,sans-serif;margin:32px;color:#171129;background:#F5F2FA}h1{font-size:22px}h2{font-size:15px;margin:28px 0 8px}table{border-collapse:collapse;background:#fff;border:1px solid #E3DDEC}td{padding:8px 14px;border-top:1px solid #E3DDEC;font-size:14px}a{color:#4B2AA4}.muted{color:#6E6880}</style>
</head><body><h1>LenaDena email previews</h1><p class="muted">Notification samples use today's outbox payloads. Auth templates are rendered with sample values and a local logo.</p>
${groups
  .map(
    (group) =>
      `<h2>${escapeHtml(group)}</h2><table>${entries
        .filter((entry) => entry.group === group)
        .map((entry) => `<tr><td><a href="${entry.html}">${escapeHtml(entry.label)}</a>${entry.text ? ` <a class="muted" href="${entry.text}">text</a>` : ""}</td><td>${escapeHtml(entry.subject)}</td></tr>`)
        .join("")}</table>`,
  )
  .join("\n")}
</body></html>
`;
writeFileSync(`${outDir}index.html`, index);
process.stdout.write(`Wrote ${entries.length} previews to ${outDir}index.html\n`);
