import { describe, expect, it } from "vitest";
import { buildNotificationModel, emailTones, notificationEventTypes, renderNotification, type EmailTone, type NotificationInput } from "./templates.js";

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
      "person_entry",
      "person_invite",
      "person_reminder",
      "person_statement",
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
    ["person_invite", "A friend invited you to LenaDena"],
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

  describe("person invite", () => {
    const invite = (payload: Record<string, unknown>, overrides: Partial<NotificationInput> = {}) =>
      renderNotification(input({ eventType: "person_invite", recipientName: "Friend", recipientEmail: "mani@example.com", groupName: "your group", payload, ...overrides }));
    const full = { personId: "p1", personName: "Mani Ahmed", inviterName: "Huzaifa Bin Shahid", downloadUrl: "https://i.loadly.io/lenadena" };

    it("names the inviter, greets the person by the saved name and links the download", () => {
      const message = invite(full);
      expect(message.subject).toBe("Huzaifa Bin Shahid invited you to LenaDena");
      expect(message.text).toContain("Hi Mani,");
      expect(message.text).toContain("Huzaifa Bin Shahid would like you to join them on LenaDena.");
      expect(message.text).toContain("it never moves money");
      expect(message.text).toContain("Invited by: Huzaifa Bin Shahid");
      expect(message.text).toContain("You're tracked as: Mani Ahmed");
      expect(message.html).toContain('href="https://i.loadly.io/lenadena"');
      expect(message.html).toContain(">Get LenaDena</a>");
      expect(message.text).toContain("Get LenaDena:\nhttps://i.loadly.io/lenadena");
      expect(message.html).toContain("Paste this link into your browser");
      expect(message.text).toContain("early access: the button opens Loadly");
      expect(message.text).toContain("never moves money and never asks for bank details");
      expect(message.text).toContain("saved mani@example.com in their LenaDena people");
      expect(message.text).not.toContain("tone of these emails");
    });

    it("reads the same in every tone (the invited person has no tone preference yet)", () => {
      const friendly = invite(full).text;
      for (const tone of emailTones) expect(invite(full, { tone }).text).toBe(friendly);
    });

    it("mentions Loadly only for a Loadly link", () => {
      const store = invite({ ...full, downloadUrl: "https://play.google.com/store/apps/details?id=com.lenadena" });
      expect(store.html).toContain('href="https://play.google.com/store/apps/details?id=com.lenadena"');
      expect(store.text).not.toContain("Loadly");
    });

    it("has no button without a link and asks them to get it from the inviter", () => {
      for (const downloadUrl of [null, undefined, "", "http://i.loadly.io/x", "javascript:alert(1)", "lenadena://", `https://i.loadly.io/${"x".repeat(2000)}`]) {
        const message = invite({ ...full, downloadUrl });
        expect(message.html, String(downloadUrl)).not.toContain("Get LenaDena");
        expect(message.html).not.toContain("Button not working");
        expect(message.html).not.toContain("javascript:");
        expect(message.html).not.toContain('href="lenadena://');
        expect(message.text).toContain("Ask Huzaifa for the app link");
        expect(message.text).not.toContain("Loadly");
      }
    });

    it("falls back to neutral wording without names", () => {
      const message = invite({});
      expect(message.subject).toBe("A friend invited you to LenaDena");
      expect(message.text).toContain("Hi there,");
      expect(message.text).toContain("Ask whoever invited you for the app link");
      expect(message.text).not.toContain("tracked as");
    });

    it("escapes names and keeps the subject on one line", () => {
      const message = invite({ ...full, personName: "<b>Mani</b>", inviterName: "Huz\r\nBcc: x@example.com <script>" });
      expect(message.subject).toBe("Huz Bcc: x@example.com <script> invited you to LenaDena");
      expect(message.html).not.toContain("<script>");
      expect(message.html).not.toContain("<b>Mani</b>");
      expect(message.html).toContain("Hi &lt;b&gt;Mani&lt;/b&gt;,");
      expect(message.html).toContain("&lt;script&gt;");
    });
  });
});

describe("emails to a saved person", () => {
  const owner = { ownerId: "o1", ownerName: "Huzaifa Bin Shahid", ownerEmail: "huzaifa@example.com", personId: "p1", personName: "Ali Raza" };
  // Directions are the owner's: incoming = Ali owes Huzaifa, outgoing = Huzaifa owes Ali.
  const camera = { id: "e4", title: "Camera rental", eventDate: "2026-11-08", amountMinor: 450000, paidMinor: 0, currency: "PKR", direction: "incoming", kind: "loan", status: "open", note: "Back on the 15th." };
  const dinner = { id: "e3", title: "Dinner at Kolachi", eventDate: "2026-10-02", amountMinor: 240000, paidMinor: 0, currency: "PKR", direction: "outgoing", kind: "expense", status: "open" };
  const coffee = { id: "e2", title: "Coffee money", eventDate: "2026-09-13", amountMinor: 185000, paidMinor: 50000, currency: "PKR", direction: "outgoing", kind: "expense", status: "open" };
  const loan = { id: "e1", title: "Camera loan", eventDate: "2026-09-08", amountMinor: 1200000, paidMinor: 1200000, currency: "PKR", direction: "incoming", kind: "loan", status: "settled" };
  const snapshot = { ...owner, generatedAt: "2026-11-10T09:30:00.000Z", entryCount: 4, openCount: 3, entries: [camera, dinner, coffee, loan], totals: [{ currency: "PKR", personOwesMinor: 450000, ownerOwesMinor: 375000 }] };
  const input = (eventType: string, payload: Record<string, unknown>) => ({ eventType, tone: "friendly" as const, recipientName: "Friend", recipientEmail: "ali@example.com", groupName: "your group", payload });
  // The app's money format has a no-break space ("Rs 750"); compare with a normal one so the expectations read plainly.
  const plainSpaces = <T,>(value: T): T => JSON.parse(JSON.stringify(value).replaceAll(String.fromCharCode(160), " ")) as T;
  const build = (eventType: string, payload: Record<string, unknown>) => {
    const built = buildNotificationModel(input(eventType, payload));
    return { subject: built.subject, model: plainSpaces(built.model) };
  };
  const rowsOf = (model: ReturnType<typeof buildNotificationModel>["model"], heading: string) => model.sections?.find((item) => item.heading.startsWith(heading))?.rows ?? [];

  describe("person_entry", () => {
    it("tells them about one new entry from their side", () => {
      const { subject, model } = build("person_entry", { ...snapshot, newEntries: [camera] });
      expect(subject).toBe('Huzaifa added "Camera rental" to your account');
      expect(model.heading).toBe("New entry from Huzaifa");
      expect(model.paragraphs[0]).toBe("Hi Ali,");
      expect(model.paragraphs[1]).toContain("Huzaifa added a new entry");
      expect(model.highlight).toEqual({ label: "Camera rental · You owe Huzaifa", value: "Rs 4,500" });
      expect(model.details).toEqual([
        { label: "Date", value: "8 November 2026" },
        { label: "Type", value: "Loan" },
        { label: "Note", value: "Back on the 15th.", stacked: true },
      ]);
      // 4,500 owed to Huzaifa minus 3,750 he owes: Ali owes him 750.
      expect(rowsOf(model, "Where things stand")).toEqual([{ label: "You owe Huzaifa", value: "Rs 750" }, { label: "Open entries", value: "3" }]);
      expect(model.cta).toBeUndefined();
    });

    it("lists every entry added together", () => {
      const { subject, model } = build("person_entry", { ...snapshot, newEntries: [camera, dinner, coffee] });
      expect(subject).toBe("Huzaifa added 3 entries to your account");
      expect(model.heading).toBe("Huzaifa added new entries");
      expect(model.highlight).toBeUndefined();
      expect(rowsOf(model, "What was added")).toEqual([
        { label: "Camera rental · 8 Nov", value: "You owe Rs 4,500" },
        { label: "Dinner at Kolachi · 2 Oct", value: "Huzaifa owes Rs 2,400" },
        { label: "Coffee money · 13 Sep", value: "Huzaifa owes Rs 1,350 (of Rs 1,850)" },
      ]);
    });
  });

  describe("person_statement", () => {
    it("sends the complete account, with the biggest figure first and the PDF mentioned", () => {
      const { subject, model } = build("person_statement", snapshot);
      expect(subject).toBe("Your statement with Huzaifa");
      expect(model.preheader).toContain("attached as a PDF");
      expect(model.highlight).toEqual({ label: "You owe Huzaifa", value: "Rs 750" });
      expect(model.details).toEqual([
        { label: "Entries in total", value: "4" },
        { label: "Still open", value: "3" },
        { label: "As of", value: "10 November 2026" },
      ]);
      expect(rowsOf(model, "Still open").map((item) => item.value)).toEqual(["You owe Rs 4,500", "Huzaifa owes Rs 2,400", "Huzaifa owes Rs 1,350 (of Rs 1,850)"]);
      expect(model.notes?.[0]).toBe("The PDF is attached to this email.");
    });

    it("says when everything is settled", () => {
      const { model } = build("person_statement", { ...snapshot, openCount: 0, totals: [], entries: [loan] });
      expect(model.paragraphs.join(" ")).toContain("Everything between you is settled.");
      expect(model.highlight).toBeUndefined();
      expect(rowsOf(model, "Latest entries")).toEqual([{ label: "Camera loan · 8 Sep", value: "Settled · Rs 12,000" }]);
    });

    it("breaks a second currency out and caps a long list", () => {
      const many = Array.from({ length: 12 }, (_, index) => ({ ...dinner, id: `m${index}`, title: `Open ${index}` }));
      const { model } = build("person_statement", {
        ...snapshot,
        openCount: 12,
        entryCount: 12,
        entries: many,
        totals: [{ currency: "PKR", personOwesMinor: 450000, ownerOwesMinor: 0 }, { currency: "USD", personOwesMinor: 0, ownerOwesMinor: 2500 }],
      });
      expect(model.highlight).toEqual({ label: "You owe Huzaifa", value: "Rs 4,500" });
      expect(model.details?.[0]).toEqual({ label: "Huzaifa owes you", value: expect.stringContaining("25") });
      const open = model.sections?.find((item) => item.heading.startsWith("Still open"));
      expect(open?.heading).toBe("Still open · latest 8 of 12");
      expect(open?.rows).toHaveLength(8);
    });
  });

  it("keeps the year on entries from an earlier year", () => {
    const { model } = build("person_statement", { ...snapshot, entries: [{ ...loan, eventDate: "2025-12-30", status: "open", paidMinor: 0 }] });
    expect(rowsOf(model, "Still open")[0]?.label).toBe("Camera loan · 30 Dec 2025");
  });

  describe("person_reminder", () => {
    it("reminds them how often, and who can stop it", () => {
      const weekly = build("person_reminder", { ...snapshot, frequency: "weekly" });
      expect(weekly.subject).toBe("Reminder: what's still open with Huzaifa");
      expect(weekly.model.heading).toBe("A friendly reminder");
      expect(weekly.model.paragraphs[1]).toContain("every week");
      expect(weekly.model.notes?.[0]).toBe("Only Huzaifa can change or stop these reminders.");
      expect(weekly.model.footer[0]).toContain("weekly reminders");
      expect(build("person_reminder", { ...snapshot, frequency: "monthly" }).model.paragraphs[1]).toContain("every month");
      // Settled entries are not part of a reminder.
      expect(rowsOf(weekly.model, "Still open").map((item) => item.label)).not.toContain("Camera loan · 8 Sep");
    });
  });

  describe.each(["person_entry", "person_statement", "person_reminder"])("%s", (eventType) => {
    const payload = { ...snapshot, newEntries: [camera], frequency: "weekly" };

    it("points replies at the account owner only when it has their address", () => {
      expect(build(eventType, payload).model.notes).toContain("Questions? Just reply to this email: it goes to Huzaifa.");
      const { ownerEmail: _removed, ...without } = payload;
      expect(build(eventType, without).model.notes?.join(" ")).not.toContain("reply to this email");
      expect(build(eventType, { ...payload, ownerEmail: "not an address" }).model.notes?.join(" ")).not.toContain("reply to this email");
    });

    it("explains why they got it and never claims to move money", () => {
      const { model } = build(eventType, payload);
      expect(model.footer[0]).toContain("Huzaifa saved ali@example.com in their LenaDena people");
      expect(model.footer[0]).toContain("it never moves money");
      expect(model.cta).toBeUndefined();
    });

    it("escapes hostile names and titles in the HTML and keeps a plain-text version", () => {
      const hostile = { ...payload, ownerName: "<script>alert(1)</script> Mallory", entries: [{ ...camera, title: '"><img src=x onerror=alert(1)>' }], newEntries: [{ ...camera, title: '"><img src=x onerror=alert(1)>' }] };
      const rendered = renderNotification(input(eventType, hostile));
      expect(rendered.html).not.toContain("<script>");
      expect(rendered.html).not.toContain("<img src=x");
      expect(rendered.text).toContain("Hi Ali,");
      expect(rendered.html).toContain("</html>");
    });

    it("survives an empty or broken snapshot", () => {
      const rendered = renderNotification(input(eventType, { personName: "Ali", ownerName: "Huzaifa", entries: "nope", totals: [{ currency: "XX" }, null], newEntries: 5 }));
      expect(rendered.subject.length).toBeGreaterThan(0);
      expect(rendered.html).toContain("Hi Ali,");
    });
  });
});
