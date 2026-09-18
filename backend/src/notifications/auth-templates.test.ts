import { describe, expect, it } from "vitest";
import { AUTH_TEMPLATE_TYPES, fillAuthPlaceholders, readAuthTemplates } from "./auth-templates.js";
import { renderGoTemplate } from "./go-template.js";

const sample = {
  ConfirmationURL: "https://abcdefghijklmnopqrst.supabase.co/auth/v1/verify?token=abc123&type=magiclink&redirect_to=lenadena://",
  Token: "482913",
  TokenHash: "abc123",
  SiteURL: "http://localhost:3000",
  RedirectTo: "lenadena://",
  Email: "sara@example.com",
  NewEmail: "sara.new@example.com",
  Data: { name: "Sara O'Neil" },
};
const placeholders = { LOGO_URL: "https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/brand/email-logo.png?v=1", EXPIRES_IN: "1 hour" };
const templates = readAuthTemplates();
const byType = (type: string) => templates.find((template) => template.type === type)?.html ?? "";
const linkTypes = AUTH_TEMPLATE_TYPES.filter((type) => type !== "reauthentication");

describe("Supabase auth email templates", () => {
  it("has a static subject for every auth email type", () => {
    expect(templates.map((template) => template.type)).toEqual([...AUTH_TEMPLATE_TYPES]);
    for (const template of templates) {
      expect(typeof template.subject).toBe("string");
      expect(String(template.subject).length).toBeGreaterThan(8);
      // Subjects go through html/template too; dynamic values there would be HTML-escaped.
      expect(template.subject).not.toContain("{{");
    }
  });

  it.each(AUTH_TEMPLATE_TYPES)("%s pairs the logo with the live-text wordmark", (type) => {
    const html = byType(type);
    expect(html).toMatch(/<img src="\{\{LOGO_URL\}\}" width="40" height="40" alt="LenaDena" style="display:block;/);
    expect(html).toContain(">LenaDena</td>");
    expect(html).toContain("LenaDena · Track what friends owe, never move money");
  });

  it.each(AUTH_TEMPLATE_TYPES)("%s avoids HTML comments, which Supabase's html/template strips", (type) => {
    expect(byType(type)).not.toContain("<!--");
  });

  it.each(AUTH_TEMPLATE_TYPES)("%s renders with and without a display name", (type) => {
    const filled = fillAuthPlaceholders(byType(type), placeholders);
    const named = renderGoTemplate(filled, sample);
    const anonymous = renderGoTemplate(filled, { ...sample, Data: {} });
    expect(named).toContain("Hi Sara O&#39;Neil,");
    expect(anonymous).toContain("Hi there,");
    for (const html of [named, anonymous]) {
      expect(html).not.toContain("no value");
      expect(html).not.toContain("{{");
      expect(html).toContain("expires in 1 hour");
      expect(html).toContain(`src="${placeholders.LOGO_URL}"`);
      expect(html).toContain('<meta name="color-scheme" content="light dark">');
    }
  });

  it.each(linkTypes)("%s signs in through one button with a fallback link, not a code", (type) => {
    const html = byType(type);
    expect(html).toContain('href="{{ .ConfirmationURL }}"');
    expect(html).toContain("Button not working? Paste this link into your browser:");
    expect(html).toContain(">{{ .ConfirmationURL }}</a>");
    expect(html).not.toContain(".Token");
    expect(html.match(/class="ld-btn-link"/g)).toHaveLength(1);
  });

  it("sends reauthentication as a code only", () => {
    const html = byType("reauthentication");
    expect(html).toContain("{{ .Token }}");
    expect(html).not.toContain("ConfirmationURL");
    expect(html).not.toContain("<a ");
  });

  it("shows both addresses when the email changes", () => {
    const html = renderGoTemplate(fillAuthPlaceholders(byType("email_change"), placeholders), sample);
    expect(html).toContain("sara@example.com");
    expect(html).toContain("sara.new@example.com");
  });

  it("escapes metadata like Supabase does", () => {
    const html = renderGoTemplate(fillAuthPlaceholders(byType("magic_link"), placeholders), { ...sample, Data: { name: "<script>x</script>" } });
    expect(html).toContain("Hi &lt;script&gt;x&lt;/script&gt;,");
    expect(html).not.toContain("<script>x");
  });
});

describe("Go template subset renderer", () => {
  it("renders fields and conditionals", () => {
    expect(renderGoTemplate("{{ if .Data.name }}Hi {{ .Data.name }}{{ else }}Hi there{{ end }}!", { Data: { name: "Sara" } })).toBe("Hi Sara!");
    expect(renderGoTemplate("{{ if .Data.name }}Hi {{ .Data.name }}{{ else }}Hi there{{ end }}!", { Data: {} })).toBe("Hi there!");
    expect(renderGoTemplate("{{ .Missing }}", {})).toBe("&lt;no value&gt;");
  });

  it("rejects syntax the templates must not rely on", () => {
    expect(() => renderGoTemplate("{{ .Email | printf }}", {})).toThrow("Unsupported");
    expect(() => renderGoTemplate("{{LOGO_URL}}", {})).toThrow("Unsupported");
    expect(() => renderGoTemplate("{{ if .A }}open", {})).toThrow("Unclosed");
    expect(() => renderGoTemplate("{{ end }}", {})).toThrow("Unexpected");
  });
});
