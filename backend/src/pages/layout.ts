import type { AppConfig } from "../config.js";

/**
 * The public pages the app stores ask for (privacy policy, account deletion). Plain HTML with inline CSS: no script,
 * no font or image requests, nothing that needs a sign-in, so they open for anyone, on any device, and keep working
 * under the API's content security policy (default-src 'self').
 */

export type PageContact = {
  /** Who runs the app, already trimmed. */
  operator: string;
  /** Where people write to us. Missing until SUPPORT_EMAIL is set. */
  email?: string;
};

/** Shown on both pages. Change it whenever the policy text changes in a way people should know about. */
export const POLICY_UPDATED = "16 November 2026";

export type PagePath = "/privacy" | "/delete-account";

export function contactFrom(config: Pick<AppConfig, "supportEmail" | "operatorName">): PageContact {
  return {
    operator: config.operatorName ?? "the LenaDena team",
    ...(config.supportEmail ? { email: config.supportEmail } : {}),
  };
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** A mailto link with a ready-made subject, or `fallback` (already HTML) while no contact address is configured. */
export function emailLink(contact: PageContact, subject: string, fallback: string): string {
  if (!contact.email) return fallback;
  const href = `mailto:${contact.email}?subject=${encodeURIComponent(subject)}`;
  return `<a href="${escapeHtml(href)}">${escapeHtml(contact.email)}</a>`;
}

const STYLE = `
:root{color-scheme:light dark;--bg:#faf9ff;--card:#ffffff;--ink:#1a1037;--slate:#5b5675;--line:#e4e0f2;--violet:#6848e6;--violet-soft:#efeaff;--gold:#c99a1f}
@media (prefers-color-scheme:dark){:root{--bg:#120c27;--card:#1d1540;--ink:#f1eefc;--slate:#b0a9cf;--line:#352b63;--violet:#a994ff;--violet-soft:#2a2058;--gold:#e8c158}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
a{color:var(--violet);text-underline-offset:2px}
a:focus-visible{outline:3px solid var(--violet);outline-offset:2px;border-radius:4px}
header,main,footer{max-width:46rem;margin:0 auto;padding:0 1.25rem}
header{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.75rem 1.5rem;padding-top:1.5rem;padding-bottom:1rem}
.brand{display:flex;align-items:center;gap:.6rem;font-weight:800;font-size:1.15rem;letter-spacing:.2px;color:var(--ink);text-decoration:none}
.coin{width:1.6rem;height:1.6rem;border-radius:50%;background:linear-gradient(90deg,var(--gold) 50%,#f3d37a 50%);box-shadow:0 0 0 2px var(--violet-soft)}
nav{display:flex;gap:1rem;font-size:.95rem}
nav a{color:var(--slate);text-decoration:none;padding:.15rem 0;border-bottom:2px solid transparent}
nav a[aria-current="page"]{color:var(--ink);border-bottom-color:var(--violet);font-weight:700}
main{padding-bottom:3rem}
h1{font-size:2rem;line-height:1.2;margin:1rem 0 .25rem}
h2{font-size:1.35rem;line-height:1.3;margin:2.25rem 0 .5rem}
h3{font-size:1.05rem;margin:1.5rem 0 .25rem}
p,ul,ol{margin:.6rem 0}
li{margin:.3rem 0}
.meta{color:var(--slate);font-size:.9rem;margin-top:0}
.card{background:var(--card);border:1px solid var(--line);border-radius:1rem;padding:1rem 1.25rem;margin:1.5rem 0}
.card h2{margin-top:.25rem;font-size:1.15rem}
.card ul,.card ol{padding-left:1.2rem}
.warn{border-color:var(--violet);background:var(--violet-soft)}
footer{border-top:1px solid var(--line);padding-top:1.25rem;padding-bottom:2.5rem;color:var(--slate);font-size:.9rem}
footer a{margin-right:1rem}
`;

type PageParts = {
  title: string;
  description: string;
  path: PagePath;
  /** Trusted HTML written in this repository, with any configured value already escaped. */
  body: string;
};

export function renderPage(page: PageParts, contact: PageContact): string {
  const link = (path: PagePath, label: string, marked = false) => `<a href="${path}"${marked && page.path === path ? ' aria-current="page"' : ""}>${label}</a>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="description" content="${escapeHtml(page.description)}">
<title>${escapeHtml(page.title)} · LenaDena</title>
<link rel="icon" href="data:,">
<style>${STYLE}</style>
</head>
<body>
<header>
<span class="brand"><span class="coin" aria-hidden="true"></span>LenaDena</span>
<nav aria-label="Legal pages">${link("/privacy", "Privacy policy", true)}${link("/delete-account", "Delete your account", true)}</nav>
</header>
<main>
${page.body}
</main>
<footer>
<p>LenaDena is run by ${escapeHtml(contact.operator)}.</p>
<p>${link("/privacy", "Privacy policy")}${link("/delete-account", "Delete your account")}</p>
</footer>
</body>
</html>
`;
}
