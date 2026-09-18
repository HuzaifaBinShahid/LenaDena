import { brand, type BadgeTone } from "./brand.js";
import { escapeHtml } from "./format.js";

export type DetailRow = { label: string; value: string; stacked?: boolean };

/**
 * Everything an email says, as plain text. The layout escapes every string, so callers never
 * build HTML. (The Supabase auth templates were generated from this layout with Go template
 * actions as values; those contain no characters that escaping changes.)
 */
export type EmailModel = {
  /** Document title and accessible label, usually the subject. */
  title: string;
  /** Inbox preview line, hidden in the body. */
  preheader: string;
  /** Header logo source: "cid:..." for an inline attachment or a hosted https URL. Without it only the wordmark shows. */
  logoSrc?: string;
  badge?: { glyph: string; tone: BadgeTone };
  heading: string;
  paragraphs: string[];
  /** A large figure at the top of the details card: an amount, or a one-time code. */
  highlight?: { label: string; value: string; kind?: "amount" | "code" };
  details?: DetailRow[];
  cta?: { label: string; url: string };
  /** The CTA link again as text, for clients that break buttons. */
  fallback?: { lead: string; url: string };
  /** Calm security notes under a divider at the bottom of the card. */
  notes?: string[];
  /** Why-you-got-this lines under the tagline. */
  footer: string[];
};

export type LayoutOptions = {
  /**
   * Outlook-for-Windows conditional comments (fixed 560px column, 96dpi). Supabase renders auth
   * templates with Go's html/template, which strips every HTML comment, so they are off there.
   */
  msoConditionals?: boolean;
};

const L = brand.light;
const D = brand.dark;
const FONT = brand.font;
const MAX_WIDTH = 560;

function textStyle(size: number, lineHeight: number, color: string, extra = "", margin = "0", font: string = FONT) {
  return `margin:${margin};font-family:${font};font-size:${size}px;line-height:${lineHeight}px;color:${color};mso-line-height-rule:exactly;${extra}`;
}

function css(rules: string) {
  return rules.replace(/\s*\n\s*/g, "").replace(/\s*([{};:,])\s*/g, "$1");
}

function headStyles() {
  const core = css(`
    body{margin:0 !important;padding:0 !important;width:100% !important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
    table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}
    img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none;}
    @media screen and (max-width:600px){
      .ld-shell{padding:24px 12px 32px !important;}
      .ld-pad{padding:32px 22px 28px !important;}
      .ld-h1{font-size:25px !important;line-height:32px !important;}
      .ld-hero{font-size:28px !important;line-height:36px !important;}
      .ld-btn{width:100% !important;}
      .ld-btn-link{display:block !important;}
    }
  `);
  const badges = (Object.keys(brand.badge) as BadgeTone[])
    .map((tone) => `.ld-badge-${tone}{background-color:${brand.badge[tone].dark.bg} !important;color:${brand.badge[tone].dark.fg} !important;}`)
    .join("");
  // Separate block: a client that rejects one of these selectors drops only this block.
  const theme = css(`
    :root{color-scheme:light dark;supported-color-schemes:light dark;}
    a[x-apple-data-detectors]{color:inherit !important;text-decoration:none !important;font-size:inherit !important;font-family:inherit !important;font-weight:inherit !important;line-height:inherit !important;}
    @media (prefers-color-scheme:dark){
      .ld-canvas{background-color:${D.canvas} !important;}
      .ld-card{background-color:${D.card} !important;border-color:${D.line} !important;}
      .ld-panel{background-color:${D.panel} !important;border-color:${D.line} !important;}
      .ld-rule{border-color:${D.line} !important;}
      .ld-ink{color:${D.ink} !important;}
      .ld-muted{color:${D.slate} !important;}
      .ld-link{color:${D.link} !important;}
      ${badges}
    }
    [data-ogsc] .ld-ink{color:${D.ink} !important;}
    [data-ogsc] .ld-muted{color:${D.slate} !important;}
    [data-ogsc] .ld-link{color:${D.link} !important;}
    [data-ogsb] .ld-canvas{background-color:${D.canvas} !important;}
    [data-ogsb] .ld-card{background-color:${D.card} !important;}
    [data-ogsb] .ld-panel{background-color:${D.panel} !important;}
  `);
  return `<style>${core}</style>\n<style>${theme}</style>`;
}

function preheader(text: string) {
  // Filler keeps clients from pulling body text into the inbox preview after the preheader.
  const filler = "&#8204;&#160;".repeat(60);
  return `<div style="display:none;font-size:1px;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(text)}${filler}</div>`;
}

function header(logoSrc?: string) {
  const logo = logoSrc
    ? `<td style="padding:0 12px 0 0;vertical-align:middle;"><img src="${escapeHtml(logoSrc)}" width="40" height="40" alt="${brand.name}" style="display:block;width:40px;height:40px;border:0;outline:none;text-decoration:none;border-radius:10px;font-family:${FONT};font-size:10px;line-height:12px;color:${L.violet};"></td>`
    : "";
  const wordmark = `<td class="ld-ink" style="vertical-align:middle;font-family:${FONT};font-size:20px;line-height:24px;font-weight:800;letter-spacing:-0.3px;color:${L.ink};mso-line-height-rule:exactly;">${brand.name}</td>`;
  return `<tr><td style="padding:0 4px 24px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${logo}${wordmark}</tr></table></td></tr>`;
}

function badge(value: NonNullable<EmailModel["badge"]>) {
  const colors = brand.badge[value.tone].light;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="ld-badge-${value.tone}" width="44" height="44" align="center" valign="middle" aria-hidden="true" style="width:44px;height:44px;border-radius:22px;background-color:${colors.bg};color:${colors.fg};font-family:${FONT};font-size:20px;line-height:44px;font-weight:800;text-align:center;mso-line-height-rule:exactly;">${escapeHtml(value.glyph)}</td></tr></table>`;
}

function heading(text: string) {
  return `<h1 class="ld-ink ld-h1" style="${textStyle(28, 36, L.ink, "font-weight:800;letter-spacing:-0.5px;")}">${escapeHtml(text)}</h1>`;
}

function paragraphs(list: string[]) {
  return list
    .map((text, index) => `<p class="ld-ink" style="${textStyle(16, 25, L.ink, "", index === list.length - 1 ? "0" : "0 0 14px")}">${escapeHtml(text)}</p>`)
    .join("");
}

function highlightBlock(value: NonNullable<EmailModel["highlight"]>, hasDetails: boolean) {
  const label = `<p class="ld-muted" style="${textStyle(13, 18, L.slate, "font-weight:700;")}">${escapeHtml(value.label)}</p>`;
  const figure =
    value.kind === "code"
      ? `<p class="ld-ink" style="${textStyle(34, 42, L.ink, "padding-left:8px;font-weight:700;letter-spacing:8px;", "8px 0 0", brand.monoFont)}">${escapeHtml(value.value)}</p>`
      : `<p class="ld-ink ld-hero" style="${textStyle(32, 40, L.ink, "font-weight:800;letter-spacing:-0.5px;", "4px 0 0")}">${escapeHtml(value.value)}</p>`;
  const align = value.kind === "code" ? "center" : "left";
  return `<tr><td align="${align}" style="padding:20px 20px ${hasDetails ? 14 : 20}px;text-align:${align};">${label}${figure}</td></tr>`;
}

/** Values longer than this read better on their own line than squeezed into the right column. */
const STACK_AFTER = 40;

function detailRow(row: DetailRow, first: boolean) {
  const rule = first ? "" : ` ld-rule`;
  const border = first ? "" : `border-top:1px solid ${L.line};`;
  if (row.stacked || row.value.length > STACK_AFTER) {
    return `<tr><td colspan="2"${first ? "" : ` class="ld-rule"`} style="padding:12px 0;${border}"><p class="ld-muted" style="${textStyle(14, 20, L.slate)}">${escapeHtml(row.label)}</p><p class="ld-ink" style="${textStyle(14, 21, L.ink, "word-break:break-word;", "4px 0 0")}">${escapeHtml(row.value)}</p></td></tr>`;
  }
  return `<tr><td class="ld-muted${rule}" width="42%" valign="top" style="padding:12px 12px 12px 0;${border}width:42%;font-family:${FONT};font-size:14px;line-height:20px;color:${L.slate};mso-line-height-rule:exactly;">${escapeHtml(row.label)}</td><td class="ld-ink${rule}" align="right" valign="top" style="padding:12px 0;${border}font-family:${FONT};font-size:14px;line-height:20px;font-weight:700;color:${L.ink};text-align:right;word-break:break-word;mso-line-height-rule:exactly;">${escapeHtml(row.value)}</td></tr>`;
}

function panel(highlight: EmailModel["highlight"], details: DetailRow[]) {
  const rows: string[] = [];
  if (highlight) rows.push(highlightBlock(highlight, details.length > 0));
  if (details.length > 0) {
    const inner = details.map((row, index) => detailRow(row, index === 0 && !highlight)).join("");
    rows.push(`<tr><td style="padding:${highlight ? 0 : 4}px 20px 4px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">${inner}</table></td></tr>`);
  }
  return `<table role="presentation" class="ld-panel" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${L.panel}" style="width:100%;background-color:${L.panel};border:1px solid ${L.line};border-radius:16px;border-collapse:separate;">${rows.join("")}</table>`;
}

function button(cta: NonNullable<EmailModel["cta"]>) {
  // mso-padding-alt sizes the button in Outlook for Windows, which ignores padding on links.
  return `<table role="presentation" class="ld-btn" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="${L.violet}" style="border-radius:12px;background-color:${L.violet};mso-padding-alt:14px 30px;"><a class="ld-btn-link" href="${escapeHtml(cta.url)}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 30px;font-family:${FONT};font-size:16px;line-height:22px;font-weight:700;color:${L.onViolet};text-decoration:none;text-align:center;border-radius:12px;mso-line-height-rule:exactly;">${escapeHtml(cta.label)}</a></td></tr></table>`;
}

function fallbackLink(value: NonNullable<EmailModel["fallback"]>) {
  return `<p class="ld-muted" style="${textStyle(13, 20, L.slate)}">${escapeHtml(value.lead)}</p><p style="${textStyle(13, 20, L.violet, "word-break:break-all;", "2px 0 0")}"><a class="ld-link" href="${escapeHtml(value.url)}" target="_blank" rel="noopener" style="color:${L.violet};text-decoration:underline;word-break:break-all;">${escapeHtml(value.url)}</a></p>`;
}

function notesBlock(list: string[]) {
  const text = list
    .map((note, index) => `<p class="ld-muted" style="${textStyle(13, 20, L.slate, "", index === list.length - 1 ? "0" : "0 0 8px")}">${escapeHtml(note)}</p>`)
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr><td class="ld-rule" style="padding:20px 0 0;border-top:1px solid ${L.line};">${text}</td></tr></table>`;
}

function footer(lines: string[]) {
  const tagline = `<p class="ld-muted" style="${textStyle(13, 20, L.slate, "font-weight:700;")}">${brand.name} · ${escapeHtml(brand.tagline)}</p>`;
  const rest = lines.map((line) => `<p class="ld-muted" style="${textStyle(12, 18, L.slate, "", "6px 0 0")}">${escapeHtml(line)}</p>`).join("");
  return `<tr><td style="padding:24px 8px 0;">${tagline}${rest}</td></tr>`;
}

/** Card content as stacked rows: row padding is the only spacing Outlook for Windows applies reliably. */
function cardRows(model: EmailModel) {
  const details = model.details ?? [];
  const blocks: Array<[string, number]> = [];
  if (model.badge) blocks.push([badge(model.badge), 20]);
  blocks.push([heading(model.heading), 14]);
  if (model.paragraphs.length > 0) blocks.push([paragraphs(model.paragraphs), 24]);
  if (model.highlight || details.length > 0) blocks.push([panel(model.highlight, details), 28]);
  if (model.cta) blocks.push([button(model.cta), 24]);
  if (model.fallback) blocks.push([fallbackLink(model.fallback), 28]);
  if (model.notes && model.notes.length > 0) blocks.push([notesBlock(model.notes), 0]);
  const last = blocks.length - 1;
  return blocks.map(([html, space], index) => `<tr><td style="padding:0${index === last ? "" : ` 0 ${space}px`};">${html}</td></tr>`).join("\n");
}

export function renderEmailHtml(model: EmailModel, options: LayoutOptions = {}) {
  const mso = options.msoConditionals ?? true;
  const htmlAttributes = mso ? ` xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office"` : "";
  const officeSettings = mso
    ? `\n<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->`
    : "";
  const ghostOpen = mso ? `<!--[if mso]><table role="presentation" align="center" width="${MAX_WIDTH}" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->\n` : "";
  const ghostClose = mso ? `\n<!--[if mso]></td></tr></table><![endif]-->` : "";
  const title = escapeHtml(model.title);
  return `<!DOCTYPE html>
<html lang="en" dir="ltr"${htmlAttributes}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${title}</title>${officeSettings}
${headStyles()}
</head>
<body class="ld-canvas" style="margin:0;padding:0;width:100%;background-color:${L.canvas};">
${preheader(model.preheader)}
<div role="article" aria-roledescription="email" aria-label="${title}" lang="en" dir="ltr">
<table role="presentation" class="ld-canvas" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${L.canvas}" style="width:100%;background-color:${L.canvas};">
<tr><td align="center" class="ld-shell" style="padding:40px 16px 48px;">
${ghostOpen}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${MAX_WIDTH}px;">
${header(model.logoSrc)}
<tr><td class="ld-card" bgcolor="${L.card}" style="background-color:${L.card};border:1px solid ${L.line};border-radius:20px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr><td class="ld-pad" style="padding:40px 40px 36px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
${cardRows(model)}
</table>
</td></tr></table>
</td></tr>
${footer(model.footer)}
</table>${ghostClose}
</td></tr>
</table>
</div>
</body>
</html>
`;
}

/** Plain-text alternative with the same content and order as the HTML. */
export function renderEmailText(model: EmailModel) {
  const lines: string[] = [model.heading, ""];
  for (const paragraph of model.paragraphs) lines.push(paragraph, "");
  const details = model.details ?? [];
  if (model.highlight) lines.push(`${model.highlight.label}: ${model.highlight.value}`);
  for (const row of details) lines.push(`${row.label}: ${row.value}`);
  if (model.highlight || details.length > 0) lines.push("");
  if (model.cta) lines.push(`${model.cta.label}:`, model.cta.url, "");
  for (const note of model.notes ?? []) lines.push(note, "");
  lines.push("--", `${brand.name} · ${brand.tagline}`, ...model.footer);
  return `${lines.join("\n")}\n`;
}
