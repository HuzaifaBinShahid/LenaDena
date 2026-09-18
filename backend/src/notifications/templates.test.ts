import { describe, expect, it } from "vitest";
import { emailTones, notificationEventTypes, renderNotification, type EmailTone, type NotificationInput } from "./templates.js";

const NBSP = String.fromCharCode(160);
const PKR_2400 = `Rs${NBSP}2,400`;

function input(overrides: Partial<NotificationInput> = {}): NotificationInput {
  return { eventType: "expense_added", recipientName: "Sara Khan", recipientEmail: "sara@example.com", groupName: "Weekend crew", tone: "friendly", payload: {}, ...overrides };
}

describe("notification templates", () => {
  it("uses the selected social tone", () => {
    const message = renderNotification({ eventType: "debt_reminder", recipientName: "Sara", groupName: "Weekend crew", tone: "cheeky", payload: {} });
    expect(message.text).toContain("wallet has been tagged");
  });

  it("keeps attention messages neutral and proof-free in every tone", () => {
    for (const tone of emailTones) {
      const message = renderNotification(input({ eventType: "payment_needs_attention", tone, payload: { proofUri: "https://secret.invalid/proof", note: "Private reply text" } }));
      expect(message.text).toContain("The recipient could not confirm this payment. Open LenaDena to review the private reply.");
      expect(message.subject).toBe("Payment needs attention");
      for (const body of [message.html, message.text]) {
        expect(body).not.toContain("secret.invalid");
        expect(body).not.toContain("Private reply text");
        expect(body).not.toMatch(/BREAKING|DEFEATED|legend|violence/);
      }
    }
  });

  it("labels payer fallback without implying recipient confirmation", () => {
    const message = renderNotification({ eventType: "payment_self_confirmed", recipientName: "Sara", groupName: "Weekend crew", tone: "friendly", payload: { proofUri: "https://secret.invalid/proof" } });
    expect(message.subject).toBe("Payment marked settled by payer");
    expect(message.text).toContain("payer marked this payment settled");
    expect(message.text).toContain("recipient confirmation was unavailable");
    expect(message.html).not.toContain("secret.invalid");
  });

  it("covers every event type the SQL outbox produces", () => {
    expect([...notificationEventTypes].sort()).toEqual([
      "debt_reminder",
      "expense_added",
      "group_invite",
      "payment_claimed",
      "payment_confirmed",
      "payment_needs_attention",
      "payment_self_confirmed",
    ]);
  });

  it.each([
    ["group_invite", "Join Weekend crew on LenaDena"],
    ["expense_added", "New expense in Weekend crew"],
    ["debt_reminder", "Balance reminder for Weekend crew"],
    ["payment_claimed", "Payment waiting for your review"],
    ["payment_confirmed", "Payment confirmed"],
    ["payment_self_confirmed", "Payment marked settled by payer"],
    ["payment_needs_attention", "Payment needs attention"],
    ["something_new", "Update from Weekend crew"],
  ])("uses a specific subject for %s", (eventType, subject) => {
    expect(renderNotification(input({ eventType })).subject).toBe(subject);
  });

  it("keeps subjects on one line", () => {
    const message = renderNotification(input({ groupName: "Crew\r\nBcc: someone@example.com" }));
    expect(message.subject).toBe("New expense in Crew Bcc: someone@example.com");
  });

  it("formats money like the app", () => {
    const message = renderNotification(input({ payload: { eventName: "Dinner at Kolachi", amountMinor: 240000, currency: "PKR" } }));
    expect(message.html).toContain(`>${PKR_2400}</p>`);
    expect(message.text).toContain(`Your share: ${PKR_2400}`);
    const reminder = renderNotification(input({ eventType: "debt_reminder", payload: { amountMinor: "185000", currency: "pkr" } }));
    expect(reminder.text).toContain(`Open balance: Rs${NBSP}1,850`);
  });

  it("shows no amount when the currency is missing or invalid", () => {
    for (const payload of [{ amountMinor: 240000 }, { amountMinor: 240000, currency: "Rupees" }, { amountMinor: "12.5", currency: "PKR" }]) {
      const message = renderNotification(input({ eventType: "payment_self_confirmed", payload }));
      expect(message.text).not.toContain("Amount:");
      expect(message.html).not.toContain("2,400");
      expect(message.html).not.toContain("240000");
    }
  });

  it("never prints raw minor units, undefined or NaN", () => {
    for (const eventType of [...notificationEventTypes, "something_new"]) {
      for (const tone of emailTones) {
        for (const payload of [{}, { amountMinor: 240000, currency: "PKR" }, { amountMinor: 240000 }]) {
          const message = renderNotification(input({ eventType, tone, payload }));
          for (const body of [message.subject, message.html, message.text]) {
            expect(body).not.toMatch(/minor units/i);
            expect(body).not.toMatch(/240000|undefined|\bNaN\b|\[object/);
          }
        }
      }
    }
  });

  it("escapes user-provided text", () => {
    const message = renderNotification(
      input({
        recipientName: "<b>Mallory</b>",
        groupName: 'Crew "<script>alert(1)</script>',
        payload: { eventName: '"><img src=x onerror=alert(1)>', amountMinor: 100, currency: "PKR", note: "<a href='https://evil.example'>click</a>" },
      }),
    );
    expect(message.html).not.toContain("<script>");
    expect(message.html).not.toContain("<img src=x");
    expect(message.html).not.toContain("<a href='https://evil.example'>");
    expect(message.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(message.html).toContain("Hi &lt;b&gt;Mallory&lt;/b&gt;,");
    expect(message.html).toContain("&quot;&gt;&lt;img src=x onerror=alert(1)&gt;");
  });

  it("links the button to the invite and to the payment under review", () => {
    const invite = renderNotification(input({ eventType: "group_invite", recipientName: "Friend", payload: { url: "lenadena://invite/abc123" } }));
    expect(invite.html).toContain('href="lenadena://invite/abc123"');
    expect(invite.html).toContain(">Join Weekend crew</a>");
    expect(invite.text).toContain("Join Weekend crew:\nlenadena://invite/abc123");
    expect(invite.html).toContain("Open this link on the phone where LenaDena is installed");

    const claimed = renderNotification(input({ eventType: "payment_claimed", payload: { settlementId: "d4c3b2a1" } }));
    expect(claimed.html).toContain('href="lenadena://settlement/d4c3b2a1"');
    expect(claimed.html).toContain(">Review payment</a>");
  });

  it("uses web links when a link base URL is configured", () => {
    const invite = renderNotification(input({ eventType: "group_invite", payload: { url: "lenadena://invite/abc123" } }), { linkBaseUrl: "https://app.example.com/" });
    expect(invite.html).toContain('href="https://app.example.com/invite/abc123"');
    expect(invite.html).toContain("Paste this link into your browser");
    const reminder = renderNotification(input({ eventType: "debt_reminder" }), { linkBaseUrl: "https://app.example.com" });
    expect(reminder.html).toContain('href="https://app.example.com/?tab=plan"');
  });

  it("never puts an unsafe payload URL behind the button", () => {
    const message = renderNotification(input({ eventType: "group_invite", payload: { url: "javascript:alert(1)" } }));
    expect(message.html).not.toContain("javascript:");
    expect(message.html).toContain('href="lenadena://"');
  });

  it("falls back to the friendly tone for unknown tones", () => {
    for (const tone of ["shouty", "toString", "__proto__"]) {
      const message = renderNotification(input({ eventType: "debt_reminder", tone: tone as EmailTone }));
      expect(message.text).toContain("A small balance is still waiting when you are ready.");
    }
  });

  it("greets by first name and never by a placeholder", () => {
    expect(renderNotification(input()).text).toContain("Hi Sara,");
    expect(renderNotification(input({ eventType: "group_invite", recipientName: "Friend" })).text).toContain("Hi there,");
    const noGroup = renderNotification(input({ groupName: "your group" }));
    expect(noGroup.html).not.toContain(">Group</td>");
  });

  it("shows the optional payload details a producer adds", () => {
    const message = renderNotification(
      input({ payload: { eventName: "Fuel", amountMinor: 1234500, currency: "PKR", actorName: "Ali Raza", eventDate: "2026-09-14", note: "Split evenly." } }),
    );
    expect(message.text).toContain(`Your share: Rs${NBSP}12,345`);
    expect(message.text).toContain("Added by: Ali Raza");
    expect(message.text).toContain("Date: 14 September 2026");
    expect(message.text).toContain("Note: Split evenly.");
  });

  it("puts the logo next to the wordmark, or only the wordmark without a logo", () => {
    const withLogo = renderNotification(input(), { logoSrc: "cid:email-logo@lenadena" }).html;
    expect(withLogo).toMatch(/<img src="cid:email-logo@lenadena" width="40" height="40" alt="LenaDena" style="display:block;/);
    expect(withLogo).toContain(">LenaDena</td>");
    const withoutLogo = renderNotification(input()).html;
    expect(withoutLogo).not.toContain("<img");
    expect(withoutLogo).toContain(">LenaDena</td>");
  });

  it("renders a complete email with a preheader, dark mode styles and a plain-text part", () => {
    const message = renderNotification(input({ payload: { eventName: "Dinner", amountMinor: 240000, currency: "PKR" } }));
    expect(message.html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(message.html).toContain('<meta name="color-scheme" content="light dark">');
    expect(message.html).toContain("@media (prefers-color-scheme:dark)");
    expect(message.html).toContain(`Your share of Dinner is ${PKR_2400}.`);
    expect(message.html).toContain("<!--[if mso]>");
    expect(message.text).not.toMatch(/<[a-z!]/i);
    expect(message.text).toContain("Review expense:\nlenadena://?tab=activity");
    expect(message.text).toContain("LenaDena · Track what friends owe, never move money");
  });

  it("keeps the tone hint away from people who are only invited", () => {
    const invite = renderNotification(input({ eventType: "group_invite", recipientEmail: "ali@example.com" }));
    expect(invite.text).toContain("someone invited ali@example.com to a group on LenaDena");
    expect(invite.text).not.toContain("tone of these emails");
  });
});
