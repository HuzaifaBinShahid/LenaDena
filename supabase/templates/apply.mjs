#!/usr/bin/env node
// Publishes the branded LenaDena auth emails to the hosted Supabase project.
//
//   SUPABASE_ACCESS_TOKEN=<personal access token> node --env-file=backend/.env supabase/templates/apply.mjs
//
// 1. Makes sure a public Storage bucket "brand" exists and uploads assets/email-logo.png to it
//    (Storage API with SUPABASE_SECRET_KEY; skipped when EMAIL_LOGO_URL points at a hosted logo).
// 2. Fills {{LOGO_URL}} and {{EXPIRES_IN}} (from the project's email link expiry) in every template.
// 3. PATCHes https://api.supabase.com/v1/projects/<ref>/config/auth with the six subjects and templates.
//
//   node --env-file=backend/.env supabase/templates/apply.mjs --dry-run [--upload-logo]
//
// --dry-run changes nothing in Supabase and needs no access token: it writes the final HTML to
// supabase/templates/dist/ for pasting into Dashboard > Authentication > Emails. Add --upload-logo
// to still upload the logo (secret key only). Keys and tokens are never printed.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const TYPES = ["magic_link", "confirmation", "invite", "recovery", "email_change", "reauthentication"];
const DASHBOARD_NAMES = {
  magic_link: "Magic link",
  confirmation: "Confirm signup",
  invite: "Invite user",
  recovery: "Reset password",
  email_change: "Change email address",
  reauthentication: "Reauthentication",
};
const BUCKET = "brand";
const LOGO_OBJECT = "email-logo.png";
const DEFAULT_EXPIRY_SECONDS = 3600;
const MANAGEMENT_API = "https://api.supabase.com/v1";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const uploadInDryRun = args.has("--upload-logo");

class ApplyError extends Error {}

function fail(message) {
  throw new ApplyError(message);
}

function step(message) {
  console.log(`  - ${message}`);
}

async function request(url, init, action) {
  let response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  } catch (error) {
    fail(`${action}: could not reach ${new URL(url).host} (${error instanceof Error ? error.message : String(error)}).`);
  }
  const text = await response.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    // Not JSON: keep the text for the error message.
  }
  return { response, body };
}

function apiMessage(body) {
  if (body && typeof body === "object") {
    const message = body.message ?? body.msg ?? body.error_description ?? body.error;
    if (message) return String(message).slice(0, 300);
  }
  return typeof body === "string" && body ? body.slice(0, 300) : "no details";
}

function httpFailure(action, response, body, hint = "") {
  return fail(`${action} failed with HTTP ${response.status}: ${apiMessage(body)}${hint ? `\n  ${hint}` : ""}`);
}

/** "https://<ref>.supabase.co" -> "<ref>"; SUPABASE_PROJECT_REF covers custom domains. */
function projectRef(supabaseUrl) {
  if (process.env.SUPABASE_PROJECT_REF?.trim()) return process.env.SUPABASE_PROJECT_REF.trim();
  return /^([a-z0-9-]+)\.supabase\.(co|in|net)$/i.exec(new URL(supabaseUrl).hostname)?.[1];
}

function humanDuration(seconds) {
  const plural = (count, unit) => `${count} ${unit}${count === 1 ? "" : "s"}`;
  if (seconds % 86400 === 0) return plural(seconds / 86400, "day");
  if (seconds % 3600 === 0) return plural(seconds / 3600, "hour");
  if (seconds >= 60) return plural(Math.round(seconds / 60), "minute");
  return plural(seconds, "second");
}

function storageHeaders(secretKey, extra = {}) {
  // New sb_secret_ keys belong in the apikey header only; a legacy service_role JWT also needs Authorization.
  return { apikey: secretKey, ...(secretKey.startsWith("sb_") ? {} : { Authorization: `Bearer ${secretKey}` }), ...extra };
}

function storageStatus(response, body) {
  // Storage answers some errors with HTTP 400 and the real status in the body.
  return body && typeof body === "object" && body.statusCode ? Number(body.statusCode) : response.status;
}

async function loadSources() {
  const subjects = JSON.parse(await readFile(`${here}subjects.json`, "utf8"));
  const templates = {};
  for (const type of TYPES) {
    if (typeof subjects[type] !== "string" || !subjects[type].trim()) fail(`subjects.json has no subject for "${type}".`);
    const html = await readFile(`${here}${type}.html`, "utf8");
    if (!html.includes("{{LOGO_URL}}")) fail(`${type}.html has no {{LOGO_URL}} placeholder.`);
    templates[type] = html;
  }
  const logo = await readFile(`${here}assets/${LOGO_OBJECT}`);
  if (logo.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") fail(`assets/${LOGO_OBJECT} is not a PNG file.`);
  return { subjects, templates, logo };
}

async function linkExpirySeconds(ref, accessToken) {
  if (!accessToken) return undefined;
  const { response, body } = await request(`${MANAGEMENT_API}/projects/${ref}/config/auth`, { headers: { Authorization: `Bearer ${accessToken}` } }, "Reading the auth settings");
  if (response.status === 401) httpFailure("Reading the auth settings", response, body, "Check SUPABASE_ACCESS_TOKEN: create a personal access token at https://supabase.com/dashboard/account/tokens.");
  if (response.status === 404) httpFailure("Reading the auth settings", response, body, `No project "${ref}" is visible to this access token.`);
  if (!response.ok) httpFailure("Reading the auth settings", response, body);
  // The response also holds secrets (SMTP password, provider keys): only this one number is used.
  const seconds = Number(body?.mailer_otp_exp);
  return Number.isInteger(seconds) && seconds > 0 ? seconds : undefined;
}

async function publishLogo(origin, secretKey, logo) {
  const bucketUrl = `${origin}/storage/v1/bucket/${BUCKET}`;
  const existing = await request(bucketUrl, { headers: storageHeaders(secretKey) }, `Reading the "${BUCKET}" bucket`);
  if (existing.response.ok) {
    if (existing.body?.public !== true) {
      fail(`The Storage bucket "${BUCKET}" exists but is private, so email clients cannot load the logo. Make it public (Dashboard > Storage > ${BUCKET} > Edit bucket) and run this again.`);
    }
    step(`Storage bucket "${BUCKET}" is public`);
  } else if (storageStatus(existing.response, existing.body) === 404) {
    const created = await request(
      `${origin}/storage/v1/bucket`,
      { method: "POST", headers: storageHeaders(secretKey, { "Content-Type": "application/json" }), body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }) },
      `Creating the "${BUCKET}" bucket`,
    );
    if (!created.response.ok && storageStatus(created.response, created.body) !== 409) httpFailure(`Creating the "${BUCKET}" bucket`, created.response, created.body);
    step(`Created the public Storage bucket "${BUCKET}"`);
  } else {
    const hint = [401, 403].includes(storageStatus(existing.response, existing.body)) ? "Check SUPABASE_SECRET_KEY (Dashboard > Project Settings > API Keys)." : "";
    httpFailure(`Reading the "${BUCKET}" bucket`, existing.response, existing.body, hint);
  }

  const uploaded = await request(
    `${origin}/storage/v1/object/${BUCKET}/${LOGO_OBJECT}`,
    { method: "POST", headers: storageHeaders(secretKey, { "Content-Type": "image/png", "x-upsert": "true", "cache-control": "max-age=3600" }), body: logo },
    "Uploading the logo",
  );
  if (!uploaded.response.ok) httpFailure("Uploading the logo", uploaded.response, uploaded.body);

  const url = logoUrl(origin, logo);
  const check = await request(url, {}, "Checking the public logo URL");
  if (!check.response.ok) fail(`The logo was uploaded, but ${url} answered HTTP ${check.response.status}. Check that the "${BUCKET}" bucket is public.`);
  step(`Uploaded ${LOGO_OBJECT} (${logo.length} bytes)`);
  return url;
}

function logoUrl(origin, logo) {
  // The content hash changes the URL whenever the PNG changes, so mail proxies and CDNs fetch the new logo.
  const version = createHash("sha256").update(logo).digest("hex").slice(0, 10);
  return `${origin}/storage/v1/object/public/${BUCKET}/${LOGO_OBJECT}?v=${version}`;
}

function render(templates, values) {
  const rendered = {};
  for (const type of TYPES) {
    const html = templates[type].replaceAll("{{LOGO_URL}}", values.logoUrl).replaceAll("{{EXPIRES_IN}}", values.expiresIn);
    const leftover = /\{\{[A-Z_]+\}\}/.exec(html);
    if (leftover) fail(`${type}.html still contains ${leftover[0]} after filling placeholders.`);
    rendered[type] = html;
  }
  return rendered;
}

async function writeDist(rendered, subjects) {
  const dist = `${here}dist/`;
  await mkdir(dist, { recursive: true });
  const lines = [];
  for (const type of TYPES) {
    await writeFile(`${dist}${type}.html`, rendered[type]);
    lines.push(`${DASHBOARD_NAMES[type]}\n  Subject: ${subjects[type]}\n  Body:    supabase/templates/dist/${type}.html\n`);
  }
  await writeFile(`${dist}subjects.txt`, `${lines.join("\n")}`);
  return lines;
}

async function patchAuthConfig(ref, accessToken, rendered, subjects) {
  const payload = {};
  for (const type of TYPES) {
    payload[`mailer_subjects_${type}`] = subjects[type];
    payload[`mailer_templates_${type}_content`] = rendered[type];
  }
  const { response, body } = await request(
    `${MANAGEMENT_API}/projects/${ref}/config/auth`,
    { method: "PATCH", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) },
    "Updating the auth email templates",
  );
  if (!response.ok) {
    const hint =
      response.status === 401
        ? "Check SUPABASE_ACCESS_TOKEN: create a personal access token at https://supabase.com/dashboard/account/tokens."
        : "Free-plan projects created on or after 3 June 2026 can only change auth email templates once custom SMTP is set up (Dashboard > Authentication > Emails > SMTP Settings). You can also paste the --dry-run output by hand once that is done.";
    httpFailure("Updating the auth email templates", response, body, hint);
  }
  const stored = TYPES.filter((type) => body?.[`mailer_templates_${type}_content`] === rendered[type] && body?.[`mailer_subjects_${type}`] === subjects[type]);
  return stored.length;
}

async function main() {
  if (args.has("--help") || args.has("-h")) {
    console.log(
      "Usage:\n  SUPABASE_ACCESS_TOKEN=<token> node --env-file=backend/.env supabase/templates/apply.mjs\n  node --env-file=backend/.env supabase/templates/apply.mjs --dry-run [--upload-logo]",
    );
    return;
  }
  const unknown = [...args].filter((arg) => !["--dry-run", "--upload-logo"].includes(arg));
  if (unknown.length > 0) fail(`Unknown option ${unknown.join(", ")}. Use --help for usage.`);
  if (uploadInDryRun && !dryRun) fail("--upload-logo only applies with --dry-run (a normal run always uploads the logo).");

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  if (!supabaseUrl) fail("SUPABASE_URL is not set. Run with --env-file=backend/.env (or export it).");
  let origin;
  try {
    origin = new URL(supabaseUrl).origin;
  } catch {
    fail("SUPABASE_URL is not a valid URL.");
  }
  const ref = projectRef(supabaseUrl);
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  const hostedLogo = process.env.EMAIL_LOGO_URL?.trim();
  const needsUpload = !hostedLogo && (!dryRun || uploadInDryRun);
  if (!dryRun && !accessToken) {
    fail("SUPABASE_ACCESS_TOKEN is not set. Create a personal access token at https://supabase.com/dashboard/account/tokens, or use --dry-run to paste the templates by hand.");
  }
  if (needsUpload && !secretKey) fail("SUPABASE_SECRET_KEY is not set, so the logo cannot be uploaded. Run with --env-file=backend/.env.");
  if (!ref && accessToken) fail("Could not read the project ref from SUPABASE_URL (custom domain?). Set SUPABASE_PROJECT_REF to the ref shown in Dashboard > Project Settings.");

  console.log(`LenaDena auth emails${dryRun ? " (dry run)" : ""}\n  Project: ${ref ?? origin}`);
  const { subjects, templates, logo } = await loadSources();

  const expirySeconds = (await linkExpirySeconds(ref, accessToken)) ?? DEFAULT_EXPIRY_SECONDS;
  const expiresIn = humanDuration(expirySeconds);
  step(`Links and codes expire in ${expiresIn}${accessToken ? " (from the project's email OTP expiry)" : " (Supabase default; pass SUPABASE_ACCESS_TOKEN to read the project's setting)"}`);

  let url;
  if (hostedLogo) {
    url = hostedLogo;
    step(`Using EMAIL_LOGO_URL for the logo`);
  } else if (needsUpload) {
    url = await publishLogo(origin, secretKey, logo);
  } else {
    url = logoUrl(origin, logo);
    step(`Logo URL (not uploaded in a dry run): ${url}`);
  }

  const rendered = render(templates, { logoUrl: url, expiresIn });

  if (dryRun) {
    const lines = await writeDist(rendered, subjects);
    console.log(`\nDry run: nothing changed in Supabase${needsUpload ? " except the logo upload" : ""}. Paste each file into Dashboard > Authentication > Emails:\n`);
    console.log(lines.join("\n"));
    if (!needsUpload && !hostedLogo) {
      console.log(`The templates load the logo from the "${BUCKET}" bucket. Upload it with --dry-run --upload-logo, or create a public "${BUCKET}" bucket and upload supabase/templates/assets/${LOGO_OBJECT} yourself.`);
    }
    return;
  }

  const verified = await patchAuthConfig(ref, accessToken, rendered, subjects);
  step(`Updated subjects and templates for ${TYPES.length} auth emails${verified === TYPES.length ? " (read back and verified)" : ""}`);
  console.log("\nDone. Send yourself a sign-in link from the app to see the new email.");
}

main().catch((error) => {
  console.error(`\nFailed: ${error instanceof ApplyError ? error.message : error instanceof Error ? error.stack : String(error)}`);
  process.exitCode = 1;
});
