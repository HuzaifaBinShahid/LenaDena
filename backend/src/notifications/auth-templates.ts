import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Supabase Auth email types, named like the Management API fields
 * (mailer_subjects_<type>, mailer_templates_<type>_content) and the files in supabase/templates.
 */
export const AUTH_TEMPLATE_TYPES = ["magic_link", "confirmation", "invite", "recovery", "email_change", "reauthentication"] as const;
export type AuthTemplateType = (typeof AUTH_TEMPLATE_TYPES)[number];

/** Build-time placeholders that supabase/templates/apply.mjs fills before upload; Go template actions stay. */
export type AuthTemplatePlaceholders = { LOGO_URL: string; EXPIRES_IN: string };

export const authTemplatesDir = fileURLToPath(new URL("../../../supabase/templates/", import.meta.url));

export function readAuthTemplates() {
  const subjects = JSON.parse(readFileSync(`${authTemplatesDir}subjects.json`, "utf8")) as Record<string, unknown>;
  return AUTH_TEMPLATE_TYPES.map((type) => ({
    type,
    subject: subjects[type],
    html: readFileSync(`${authTemplatesDir}${type}.html`, "utf8"),
  }));
}

export function fillAuthPlaceholders(html: string, values: AuthTemplatePlaceholders) {
  return html.replaceAll("{{LOGO_URL}}", values.LOGO_URL).replaceAll("{{EXPIRES_IN}}", values.EXPIRES_IN);
}
