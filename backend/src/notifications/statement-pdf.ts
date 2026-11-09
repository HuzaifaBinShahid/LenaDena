import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import { brand } from "./brand.js";
import { cleanText, firstName, formatEmailDate, formatMoney } from "./format.js";
import { findEmailLogoFile } from "./logo.js";
import { netPosition, remainingOf, type StatementData, type StatementEntry, type StatementTotal } from "./statement.js";

/*
 * The statement PDF attached to "here is the complete hisab" emails.
 *
 * Everything is drawn by hand at explicit coordinates (page margins are 0 and no text is ever wrapped by pdfkit), so
 * nothing paginates behind our back: rows are measured first, a row that does not fit moves to the next page whole, and
 * the page footers are added once the page count is known. Only the bundled Manrope weights are used, so the PDF looks
 * the same everywhere and never falls back to a built-in font.
 */

// ---------------------------------------------------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------------------------------------------------

const FONT_FILES = {
  regular: "Manrope_400Regular.ttf",
  semibold: "Manrope_600SemiBold.ttf",
  bold: "Manrope_700Bold.ttf",
  extrabold: "Manrope_800ExtraBold.ttf",
} as const;

type FontKey = keyof typeof FONT_FILES;
const FONT_KEYS = Object.keys(FONT_FILES) as FontKey[];
const fontName = (key: FontKey) => `LenaDena-${key}`;

/**
 * The TTFs live in src/notifications/assets/fonts. tsx runs this module from src/, the compiled worker from
 * dist/notifications/ (the build script copies the assets there; the second candidate reaches back into src/ when a
 * build skipped that step). Same lookup as the email logo.
 */
function findFontFile(fileName: string): string | undefined {
  const candidates = [new URL(`./assets/fonts/${fileName}`, import.meta.url), new URL(`../../src/notifications/assets/fonts/${fileName}`, import.meta.url)];
  return candidates.map((candidate) => fileURLToPath(candidate)).find((path) => existsSync(path));
}

let fontPaths: Record<FontKey, string> | undefined;

/** Resolves every bundled weight once. A missing file is a broken deploy, so it fails loudly instead of changing the look. */
function loadFontPaths(): Record<FontKey, string> {
  if (fontPaths) return fontPaths;
  const found = {} as Record<FontKey, string>;
  for (const key of FONT_KEYS) {
    const path = findFontFile(FONT_FILES[key]);
    if (!path) {
      throw new Error(`Statement PDF font file ${FONT_FILES[key]} is missing: expected it in assets/fonts next to the module or in src/notifications/assets/fonts. Rebuild so the assets are copied.`);
    }
    found[key] = path;
  }
  fontPaths = found;
  return found;
}

// ---------------------------------------------------------------------------------------------------------------------
// Colours (brand.ts tokens; the darker "text" tones are mixes of a token with ink so small coloured text stays readable)
// ---------------------------------------------------------------------------------------------------------------------

function mix(from: string, to: string, amount: number): string {
  const channels = (hex: string) => [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  const a = channels(from);
  const b = channels(to);
  return `#${a.map((value, index) => Math.round(value + ((b[index] ?? value) - value) * amount).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

const WHITE = "#FFFFFF";
const light = brand.light;
const palette = {
  violet: light.violet,
  violetStrong: light.violetStrong,
  violetSoft: brand.badge.violet.light.bg,
  ink: light.ink,
  slate: light.slate,
  slateSoft: mix(light.slate, WHITE, 0.4),
  line: light.line,
  panel: light.panel,
  mint: brand.badge.mint.light.fg,
  mintSoft: brand.badge.mint.light.bg,
  mintText: mix(brand.badge.mint.light.fg, light.ink, 0.38),
  coral: brand.badge.coral.light.fg,
  coralSoft: brand.badge.coral.light.bg,
  coralText: mix(brand.badge.coral.light.fg, light.ink, 0.38),
  gold: brand.badge.gold.light.fg,
  goldSoft: brand.badge.gold.light.bg,
  goldText: mix(brand.badge.gold.light.fg, light.ink, 0.5),
  bandSubtle: mix(light.violet, WHITE, 0.78),
};

// ---------------------------------------------------------------------------------------------------------------------
// Page geometry (A4 in points)
// ---------------------------------------------------------------------------------------------------------------------

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;
const CONTENT_RIGHT = PAGE_W - MARGIN;
/** Content never goes below this line; the footer lives under it. */
const CONTENT_BOTTOM = PAGE_H - 56;
const BAND_H = 88;
const SLIM_H = 30;

/** Manrope metrics per em: pdfkit puts the line box's top at `baseline - ASCENT * size`. */
const ASCENT = 1.066;
const CAP_HEIGHT = 0.72;
/** Optical middle of capitals and figures above the baseline, per em. */
const MID = CAP_HEIGHT / 2;

type TextOptions = {
  font: FontKey;
  size: number;
  color: string;
  align?: "left" | "right" | "center";
  /** Extra space between characters, in points. */
  spacing?: number;
  /** Tabular figures, so amounts line up in a column. */
  tabular?: boolean;
};

type GlyphCheck = (codePoint: number) => boolean;

/** Used only if the font's glyph lookup is not available: Basic Latin, Latin-1, Latin Extended-A/B and common punctuation. */
const fallbackGlyphCheck: GlyphCheck = (cp) =>
  (cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0x24f) || (cp >= 0x2010 && cp <= 0x2026) || cp === 0x20ac;

/** Format controls and joiners that have no glyph of their own: dropped silently instead of printed as "?". */
function isInvisible(cp: number): boolean {
  return (
    (cp >= 0x200b && cp <= 0x200f) || // zero-width space/joiners, direction marks
    (cp >= 0x202a && cp <= 0x202e) || // embeddings and overrides
    (cp >= 0x2060 && cp <= 0x2064) ||
    (cp >= 0x2066 && cp <= 0x2069) ||
    (cp >= 0xfe00 && cp <= 0xfe0f) || // variation selectors (emoji presentation)
    cp === 0xfeff ||
    cp === 0xad
  );
}

function isSpaceLike(cp: number): boolean {
  return cp === 0xa0 || (cp >= 0x2000 && cp <= 0x200a) || cp === 0x202f || cp === 0x205f || cp === 0x3000 || cp === 0x1680;
}

/**
 * Wraps the font's own cmap lookup (fontkit's `hasGlyphForCodePoint`, reached through pdfkit's private `_font`). If the
 * shape of pdfkit changes, the conservative Latin allowlist is used instead, so the PDF still never prints missing-glyph boxes.
 */
function glyphCheckFor(doc: PDFKit.PDFDocument): GlyphCheck {
  try {
    const font = (doc as unknown as { _font?: { font?: { hasGlyphForCodePoint?: unknown } } })._font?.font;
    const lookup = font?.hasGlyphForCodePoint;
    if (typeof lookup === "function") {
      const has = (lookup as (cp: number) => unknown).bind(font);
      // Sanity probe: a working lookup knows "A" and does not know a private-use code point.
      if (has(0x41) === true && has(0xe000) === false) {
        return (cp) => {
          try {
            return has(cp) === true;
          } catch {
            return fallbackGlyphCheck(cp);
          }
        };
      }
    }
  } catch {
    // fall through to the allowlist
  }
  return fallbackGlyphCheck;
}

/** The pen: measures and draws text with the registered fonts. Never lets a string through that the font cannot show. */
class Pen {
  readonly ellipsis: string;
  private readonly supports: GlyphCheck;
  private readonly known = new Map<number, boolean>();

  constructor(readonly doc: PDFKit.PDFDocument) {
    this.supports = glyphCheckFor(doc);
    this.ellipsis = this.has(0x2026) ? "…" : "...";
  }

  private has(cp: number): boolean {
    const cached = this.known.get(cp);
    if (cached !== undefined) return cached;
    const result = this.supports(cp);
    this.known.set(cp, result);
    return result;
  }

  /** Single-line printable text: controls and odd spaces become one space, invisible joiners vanish, unknown scripts and emoji become one "?" per run. */
  clean(value: unknown): string {
    const raw = typeof value === "string" ? value : typeof value === "number" && Number.isFinite(value) ? String(value) : "";
    let out = "";
    let placeholder = false;
    for (const char of raw.normalize("NFC")) {
      const cp = char.codePointAt(0) ?? 0;
      if (isInvisible(cp)) continue;
      if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f) || isSpaceLike(cp) || cp === 0x2028 || cp === 0x2029) {
        out += " ";
        placeholder = false;
      } else if (this.has(cp)) {
        out += char;
        placeholder = false;
      } else if (!placeholder) {
        out += "?";
        placeholder = true;
      }
    }
    return out.replace(/ {2,}/g, " ").trim();
  }

  private use(options: Pick<TextOptions, "font" | "size">) {
    return this.doc.font(fontName(options.font)).fontSize(options.size);
  }

  width(text: string, options: Pick<TextOptions, "font" | "size" | "spacing" | "tabular">): number {
    if (!text) return 0;
    const extra = {
      ...(options.spacing ? { characterSpacing: options.spacing } : {}),
      ...(options.tabular ? { features: ["tnum" as const] } : {}),
    };
    return this.use(options).widthOfString(text, extra) + (options.spacing ?? 0);
  }

  /** Draws one line with its BASELINE at `baseline`; `x` is the left edge, the right edge, or the centre depending on `align`. */
  text(text: string, x: number, baseline: number, options: TextOptions): void {
    if (!text) return;
    const width = this.width(text, options);
    const left = options.align === "right" ? x - width : options.align === "center" ? x - width / 2 : x;
    this.use(options)
      .fillColor(options.color)
      .text(text, left, baseline - ASCENT * options.size, {
        lineBreak: false,
        ...(options.spacing ? { characterSpacing: options.spacing } : {}),
        ...(options.tabular ? { features: ["tnum" as const] } : {}),
      });
  }

  /** Cuts a line to `maxWidth`, ending with an ellipsis. */
  ellipsize(text: string, maxWidth: number, options: Pick<TextOptions, "font" | "size" | "spacing" | "tabular">): string {
    if (this.width(text, options) <= maxWidth) return text;
    const chars = Array.from(text);
    while (chars.length > 0 && this.width(`${chars.join("").trimEnd()}${this.ellipsis}`, options) > maxWidth) chars.pop();
    return `${chars.join("").trimEnd()}${this.ellipsis}`;
  }

  /** One line that must fit: shrinks the type a little first (large amounts), then cuts with an ellipsis. */
  fit(text: string, maxWidth: number, options: TextOptions, minSize = options.size - 1.5): { text: string; size: number } {
    let size = options.size;
    while (size > minSize && this.width(text, { ...options, size }) > maxWidth) size -= 0.25;
    return { text: this.ellipsize(text, maxWidth, { ...options, size }), size };
  }

  /** Greedy word wrap; a word wider than the line is broken by characters, so nothing can overflow. Cuts with an ellipsis after `maxLines`. */
  wrap(text: string, maxWidth: number, options: Pick<TextOptions, "font" | "size" | "spacing">, maxLines = Number.POSITIVE_INFINITY): string[] {
    const lines: string[] = [];
    let current = "";
    for (const word of text.split(" ")) {
      if (!word) continue;
      const candidate = current ? `${current} ${word}` : word;
      if (this.width(candidate, options) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      current = "";
      if (this.width(word, options) <= maxWidth) {
        current = word;
        continue;
      }
      let chunk = "";
      for (const char of Array.from(word)) {
        if (chunk && this.width(chunk + char, options) > maxWidth) {
          lines.push(chunk);
          chunk = char;
        } else {
          chunk += char;
        }
      }
      current = chunk;
    }
    if (current) lines.push(current);
    if (lines.length > maxLines) {
      const kept = lines.slice(0, maxLines);
      kept[maxLines - 1] = this.ellipsize(`${kept[maxLines - 1] ?? ""}${this.ellipsis}`, maxWidth, options);
      return kept;
    }
    return lines;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------------------------------------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** "13 Sep 2026" from "2026-09-13" (always three letters; Intl would print "Sept" in en-GB). */
function shortDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  if (!match || !month) return isoDate;
  return `${Number(match[3])} ${month} ${match[1]}`;
}

function moneyText(amountMinor: number, currency: string): string {
  const formatted = formatMoney(amountMinor, currency);
  if (formatted) return formatted;
  const major = Number.isFinite(amountMinor) ? Math.round(amountMinor / 100).toLocaleString("en-GB") : "?";
  return `${currency.toUpperCase()} ${major}`;
}

function compactMoney(amountMinor: number, currency: string): string | undefined {
  try {
    return new Intl.NumberFormat("en-PK", { style: "currency", currency: currency.toUpperCase(), notation: "compact", maximumFractionDigits: 1 }).format(amountMinor / 100);
  } catch {
    return undefined;
  }
}

function validDate(value: string): Date | undefined {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** `LenaDena-statement-Ali-2026-11-10.pdf`: ASCII only, safe for any mail client or file system. */
export function statementFileName(statement: Pick<StatementData, "personName" | "generatedAt">): string {
  const person = (typeof statement.personName === "string" ? statement.personName : "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 40);
  const date = (validDate(statement.generatedAt) ?? new Date()).toISOString().slice(0, 10);
  return `LenaDena-statement-${person || "statement"}-${date}.pdf`;
}

// ---------------------------------------------------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------------------------------------------------

type Tone = "mint" | "coral" | "violet" | "gold" | "slate";

const tones: Record<Tone, { fill: string; text: string; solid: string; big: string }> = {
  mint: { fill: palette.mintSoft, text: palette.mintText, solid: palette.mint, big: mix(palette.mint, palette.ink, 0.2) },
  coral: { fill: palette.coralSoft, text: palette.coralText, solid: palette.coral, big: mix(palette.coral, palette.ink, 0.2) },
  violet: { fill: palette.violetSoft, text: palette.violetStrong, solid: palette.violet, big: palette.violetStrong },
  gold: { fill: palette.goldSoft, text: palette.goldText, solid: palette.gold, big: palette.goldText },
  slate: { fill: palette.panel, text: palette.slate, solid: palette.slateSoft, big: palette.slate },
};

type Column = { key: "date" | "entry" | "type" | "amount" | "paid" | "open" | "status"; label: string; x: number; w: number; align: "left" | "right" };

const TABLE_PAD = 6;
const STRIPE_W = 3;

function buildColumns(): Column[] {
  const fixed = { date: 64, type: 40, amount: 60, paid: 54, open: 60, status: 60 };
  const entryWidth = CONTENT_W - Object.values(fixed).reduce((sum, width) => sum + width, 0);
  const spec: Array<[Column["key"], string, number, Column["align"]]> = [
    ["date", "Date", fixed.date, "left"],
    ["entry", "Entry", entryWidth, "left"],
    ["type", "Type", fixed.type, "left"],
    ["amount", "Amount", fixed.amount, "right"],
    ["paid", "Paid", fixed.paid, "right"],
    ["open", "Open", fixed.open, "right"],
    ["status", "Status", fixed.status, "left"],
  ];
  let x = MARGIN;
  return spec.map(([key, label, w, align]) => {
    const col = { key, label, x, w, align };
    x += w;
    return col;
  });
}

const COLUMNS = buildColumns();
const column = (key: Column["key"]): Column => COLUMNS.find((candidate) => candidate.key === key) as Column;

type CardModel = { label: string; sentence: string; amount: string; detail?: string; tone: Tone };

function drawStatement(doc: PDFKit.PDFDocument, statement: StatementData, logoPath: string | undefined): void {
  const pen = new Pen(doc);
  const owner = pen.clean(statement.ownerName) || "A friend";
  const person = pen.clean(statement.personName) || "you";
  const generatedLong = pen.clean(formatEmailDate(statement.generatedAt) ?? "") || "today";
  const money = (amountMinor: number, currency: string) => pen.clean(moneyText(amountMinor, currency)) || "–";

  let y = 0;
  let pageNumber = 0;

  // ---- page chrome -------------------------------------------------------------------------------------------------

  const drawBand = () => {
    const gradient = doc.linearGradient(0, 0, PAGE_W, BAND_H);
    gradient.stop(0, palette.violet).stop(1, palette.violetStrong);
    doc.rect(0, 0, PAGE_W, BAND_H).fill(gradient);
    // Two soft circles for depth, clipped to the band.
    doc.save();
    doc.rect(0, 0, PAGE_W, BAND_H).clip();
    doc.fillOpacity(0.1).circle(PAGE_W - 70, 6, 78).fill(WHITE);
    doc.fillOpacity(0.07).circle(PAGE_W - 190, BAND_H + 26, 58).fill(WHITE);
    doc.restore();

    let wordmarkX = MARGIN;
    if (logoPath) {
      try {
        doc.save();
        doc.roundedRect(MARGIN, 26, 36, 36, 9).clip();
        doc.image(logoPath, MARGIN, 26, { width: 36, height: 36 });
        doc.restore();
        wordmarkX = MARGIN + 36 + 11;
      } catch {
        doc.restore();
      }
    }
    pen.text(brand.name, wordmarkX, 46, { font: "extrabold", size: 21, color: WHITE });
    pen.text(pen.clean(brand.tagline), wordmarkX, 60, { font: "regular", size: 8.5, color: palette.bandSubtle });
    pen.text("STATEMENT", CONTENT_RIGHT, 43, { font: "extrabold", size: 12, color: WHITE, align: "right", spacing: 2.4 });
    pen.text(`Generated ${generatedLong}`, CONTENT_RIGHT, 58, { font: "regular", size: 8.5, color: palette.bandSubtle, align: "right" });
  };

  const drawSlimBand = () => {
    const gradient = doc.linearGradient(0, 0, PAGE_W, SLIM_H);
    gradient.stop(0, palette.violet).stop(1, palette.violetStrong);
    doc.rect(0, 0, PAGE_W, SLIM_H).fill(gradient);
    pen.text(brand.name, MARGIN, 19.5, { font: "extrabold", size: 11.5, color: WHITE });
    const label = pen.ellipsize(`Statement  ·  ${owner} and ${person}`, CONTENT_W - 110, { font: "semibold", size: 8 });
    pen.text(label, CONTENT_RIGHT, 18.5, { font: "semibold", size: 8, color: palette.bandSubtle, align: "right" });
  };

  const newPage = () => {
    doc.addPage();
    pageNumber += 1;
    if (pageNumber === 1) {
      drawBand();
      y = BAND_H + 30;
    } else {
      drawSlimBand();
      y = SLIM_H + 26;
    }
  };

  /** Starts a new page unless `height` still fits above the footer. Returns true when it broke. */
  const ensure = (height: number): boolean => {
    if (y + height <= CONTENT_BOTTOM) return false;
    newPage();
    return true;
  };

  newPage();

  // ---- title -------------------------------------------------------------------------------------------------------

  pen.text("Statement of account", MARGIN, y + 7, { font: "bold", size: 9.5, color: palette.violet, spacing: 0.4 });
  const heading = `${owner} and ${person}`;
  let headingSize = 15.5;
  for (const size of [23, 19]) {
    if (pen.wrap(heading, CONTENT_W, { font: "extrabold", size }).length <= 2) {
      headingSize = size;
      break;
    }
  }
  const headingLines = pen.wrap(heading, CONTENT_W, { font: "extrabold", size: headingSize }, 3);
  const headingLead = headingSize * 1.2;
  let baseline = y + 7 + 11 + CAP_HEIGHT * headingSize;
  headingLines.forEach((line, index) => {
    pen.text(line, MARGIN, baseline + index * headingLead, { font: "extrabold", size: headingSize, color: palette.ink });
  });
  baseline += (headingLines.length - 1) * headingLead + 18;
  pen.text(`Everything tracked between you, as of ${generatedLong}`, MARGIN, baseline, { font: "regular", size: 9.5, color: palette.slate });
  y = baseline + 24;

  // ---- summary cards -----------------------------------------------------------------------------------------------

  const cardFor = (total: StatementTotal): CardModel => {
    const net = netPosition(total);
    if (net.side === "even") {
      return {
        label: total.currency,
        sentence: `${person} and ${owner} are even`,
        amount: "All square",
        detail: "What each owes the other cancels out.",
        tone: "violet",
      };
    }
    const bothWays = total.personOwesMinor > 0 && total.ownerOwesMinor > 0;
    return {
      label: total.currency,
      sentence: net.side === "personOwes" ? `${person} owes ${owner}` : `${owner} owes ${person}`,
      amount: money(net.amountMinor, total.currency),
      ...(bothWays
        ? { detail: `Open both ways: ${person} owes ${money(total.personOwesMinor, total.currency)}, ${owner} owes ${money(total.ownerOwesMinor, total.currency)}.` }
        : {}),
      tone: net.side === "personOwes" ? "coral" : "mint",
    };
  };

  const cards: CardModel[] =
    statement.totals.length > 0
      ? statement.totals.map(cardFor)
      : [{ label: "Balance", sentence: "Nothing is open.", amount: "All settled", tone: "mint" }];

  const GAP = 10;
  const CARD_W = (CONTENT_W - GAP) / 2;
  const CARD_PAD = 16;

  type CardLayout = { model: CardModel; sentenceLines: string[]; detailLines: string[]; amountBaseline: number; detailBaseline: number; height: number };
  const AMOUNT_SIZE = 22;
  const layoutCard = (model: CardModel): CardLayout => {
    const inner = CARD_W - CARD_PAD * 2;
    const sentenceLines = pen.wrap(model.sentence, inner, { font: "semibold", size: 9 }, 2);
    const detailLines = model.detail ? pen.wrap(model.detail, inner, { font: "regular", size: 7.5 }, 3) : [];
    // Baselines measured from the top of the card: label 27, sentence from 46 (12 apart), amount, then the detail.
    const amountBaseline = 46 + (sentenceLines.length - 1) * 12 + 11 + CAP_HEIGHT * AMOUNT_SIZE;
    const detailBaseline = amountBaseline + 15;
    const height = detailLines.length > 0 ? detailBaseline + (detailLines.length - 1) * 10 + 15 : amountBaseline + 17;
    return { model, sentenceLines, detailLines, amountBaseline, detailBaseline, height };
  };

  const drawCard = (layout: CardLayout, x: number, top: number, height: number) => {
    const tone = tones[layout.model.tone];
    doc.roundedRect(x, top, CARD_W, height, 12).fill(palette.panel);
    doc.circle(x + CARD_PAD + 3, top + 24.4, 3).fill(tone.solid);
    pen.text(layout.model.label.toUpperCase(), x + CARD_PAD + 12, top + 27, { font: "bold", size: 7.5, color: palette.slate, spacing: 1 });
    layout.sentenceLines.forEach((sentence, index) => {
      pen.text(sentence, x + CARD_PAD, top + 46 + index * 12, { font: "semibold", size: 9, color: palette.slate });
    });
    const amount = pen.fit(layout.model.amount, CARD_W - CARD_PAD * 2, { font: "extrabold", size: AMOUNT_SIZE, color: tone.big }, 11);
    pen.text(amount.text, x + CARD_PAD, top + layout.amountBaseline, { font: "extrabold", size: amount.size, color: tone.big, tabular: true });
    layout.detailLines.forEach((detail, index) => {
      pen.text(detail, x + CARD_PAD, top + layout.detailBaseline + index * 10, { font: "regular", size: 7.5, color: palette.slate });
    });
  };

  const drawStatsCard = (x: number, top: number, width: number, height: number) => {
    doc.roundedRect(x, top, width, height, 12).fill(palette.panel);
    const settled = Math.max(0, statement.entryCount - statement.openCount);
    const stats: Array<[string, string]> = [
      [String(statement.entryCount), "entries"],
      [String(statement.openCount), "open"],
      [String(settled), "settled"],
    ];
    const slot = width / stats.length;
    stats.forEach(([value, label], index) => {
      const centre = x + slot * index + slot / 2;
      const valueSize = 22;
      const block = CAP_HEIGHT * valueSize + 14;
      const valueBaseline = top + (height - block) / 2 + CAP_HEIGHT * valueSize;
      pen.text(value, centre, valueBaseline, { font: "extrabold", size: valueSize, color: palette.ink, align: "center", tabular: true });
      pen.text(label, centre, valueBaseline + 14, { font: "semibold", size: 8, color: palette.slate, align: "center" });
      if (index > 0) doc.moveTo(x + slot * index, top + height / 2 - 18).lineTo(x + slot * index, top + height / 2 + 18).lineWidth(0.75).strokeColor(palette.line).stroke();
    });
  };

  const layouts = cards.map(layoutCard);
  for (let index = 0; index < layouts.length; index += 2) {
    const left = layouts[index] as CardLayout;
    const right = layouts[index + 1];
    const lastRow = index + 2 >= layouts.length;
    const needsStatsCell = lastRow && right === undefined;
    const height = Math.max(left.height, right?.height ?? 0, needsStatsCell ? 78 : 0);
    ensure(height + GAP);
    drawCard(left, MARGIN, y, height);
    if (right) drawCard(right, MARGIN + CARD_W + GAP, y, height);
    else if (needsStatsCell) drawStatsCard(MARGIN + CARD_W + GAP, y, CARD_W, height);
    y += height + GAP;
  }
  if (layouts.length % 2 === 0) {
    ensure(70 + GAP);
    drawStatsCard(MARGIN, y, CONTENT_W, 70);
    y += 70 + GAP;
  }
  y += 14;

  // ---- entries -----------------------------------------------------------------------------------------------------

  /** The first word that is more than "?" placeholders, so "علي Ali Khan" is called "Ali" rather than "?". */
  const callName = (name: string) => name.split(" ").find((word) => /[^?\s]/.test(word)) ?? firstName(name);
  const ownerShort = callName(owner) || owner;
  const personShort = callName(person) || person;
  const sameFirstName = ownerShort.toLowerCase() === personShort.toLowerCase();
  const ownerLabel = sameFirstName ? owner : ownerShort;
  const personLabel = sameFirstName ? person : personShort;

  const HEADER_H = 22;
  const drawSectionHeading = () => {
    pen.text("Entries", MARGIN, y + 12, { font: "extrabold", size: 14, color: palette.ink });
    if (statement.entries.length > 1) pen.text("Newest first", CONTENT_RIGHT, y + 11.5, { font: "semibold", size: 8, color: palette.slate, align: "right" });
    if (statement.entries.length === 0) {
      y += 26;
      return;
    }
    let legendX = MARGIN;
    const legendBaseline = y + 28;
    const legend: Array<[Tone, string]> = [
      ["mint", `${ownerLabel} owes ${personLabel}`],
      ["coral", `${personLabel} owes ${ownerLabel}`],
    ];
    for (const [tone, label] of legend) {
      const text = pen.ellipsize(label, 140, { font: "semibold", size: 7.5 });
      doc.circle(legendX + 3, legendBaseline - 2.6, 3).fill(tones[tone].solid);
      pen.text(text, legendX + 11, legendBaseline, { font: "semibold", size: 7.5, color: palette.slate });
      legendX += 11 + pen.width(text, { font: "semibold", size: 7.5 }) + 16;
    }
    pen.text("Open is what is still unpaid.", CONTENT_RIGHT, legendBaseline, { font: "regular", size: 7.5, color: palette.slateSoft, align: "right" });
    y += 40;
    if (statement.entryCount > statement.entries.length) {
      pen.text(`Showing the latest ${statement.entries.length} of ${statement.entryCount} entries; totals include every entry.`, MARGIN, y + 2, { font: "regular", size: 8, color: palette.slate });
      y += 16;
    }
  };

  const drawTableHeader = () => {
    doc.roundedRect(MARGIN, y, CONTENT_W, HEADER_H, 7).fill(palette.panel);
    for (const col of COLUMNS) {
      const pad = col.key === "date" ? TABLE_PAD + STRIPE_W + 1 : TABLE_PAD;
      const x = col.align === "right" ? col.x + col.w - TABLE_PAD : col.x + pad;
      pen.text(col.label.toUpperCase(), x, y + HEADER_H / 2 + MID * 6.8, { font: "bold", size: 6.8, color: palette.slate, align: col.align, spacing: 0.7 });
    }
    y += HEADER_H;
  };

  const TITLE_SIZE = 8.5;
  const TITLE_LEAD = 11;
  const NOTE_SIZE = 7.5;
  const NOTE_LEAD = 10;
  const PAD_TOP = 8;
  const PAD_BOTTOM = 9;

  type RowLayout = {
    entry: StatementEntry;
    settled: boolean;
    titleLines: string[];
    note: string[];
    label: string;
    height: number;
  };

  const entryInner = column("entry").w - TABLE_PAD * 2;
  const layoutRow = (entry: StatementEntry): RowLayout => {
    const settled = entry.status === "settled";
    const titleLines = pen.wrap(pen.clean(entry.title) || "Untitled", entryInner, { font: "semibold", size: TITLE_SIZE }, 3);
    const note = entry.note ? pen.wrap(pen.clean(entry.note), entryInner, { font: "regular", size: NOTE_SIZE }, 8) : [];
    const owes = entry.direction === "incoming" ? `${personLabel} owes ${ownerLabel}` : `${ownerLabel} owes ${personLabel}`;
    const label = pen.ellipsize(owes, entryInner, { font: "semibold", size: 7 });
    let last = PAD_TOP + CAP_HEIGHT * TITLE_SIZE + (titleLines.length - 1) * TITLE_LEAD;
    last += 11.5; // direction label
    if (note.length > 0) last += 11 + (note.length - 1) * NOTE_LEAD;
    return { entry, settled, titleLines, note, label, height: Math.max(last + PAD_BOTTOM, 30) };
  };

  const drawRow = (row: RowLayout) => {
    const { entry, settled } = row;
    const top = y;
    const dir: Tone = entry.direction === "incoming" ? "coral" : "mint";
    const quiet = palette.slateSoft;
    const first = top + PAD_TOP + CAP_HEIGHT * TITLE_SIZE; // baseline of the first line in every cell

    if (settled) doc.rect(MARGIN, top, CONTENT_W, row.height).fill(mix(palette.panel, WHITE, 0.55));
    doc.rect(MARGIN, top + 4, STRIPE_W, row.height - 8).fill(settled ? palette.line : tones[dir].solid);

    const date = column("date");
    pen.text(shortDate(entry.eventDate), date.x + TABLE_PAD + STRIPE_W + 1, first, { font: "regular", size: 8, color: settled ? quiet : palette.slate, tabular: true });

    const entryCol = column("entry");
    let baseline = first;
    for (const line of row.titleLines) {
      pen.text(line, entryCol.x + TABLE_PAD, baseline, { font: "semibold", size: TITLE_SIZE, color: settled ? palette.slate : palette.ink });
      baseline += TITLE_LEAD;
    }
    baseline += -TITLE_LEAD + 11.5;
    pen.text(row.label, entryCol.x + TABLE_PAD, baseline, { font: "semibold", size: 7, color: settled ? quiet : tones[dir].text });
    if (row.note.length > 0) {
      baseline += 11;
      for (const line of row.note) {
        pen.text(line, entryCol.x + TABLE_PAD, baseline, { font: "regular", size: NOTE_SIZE, color: settled ? quiet : palette.slate });
        baseline += NOTE_LEAD;
      }
    }

    const type = column("type");
    pen.text(entry.kind === "loan" ? "Loan" : "Expense", type.x + TABLE_PAD, first, { font: "regular", size: 8, color: settled ? quiet : palette.slate });

    /** An amount is never cut off (a clipped figure reads as a different number): it shrinks, and only an absurdly long one falls back to compact form ("Rs 1.2T"). */
    const money1 = (key: "amount" | "paid" | "open", minor: number | undefined, options: Pick<TextOptions, "font" | "color">) => {
      const col = column(key);
      const width = col.w - TABLE_PAD * 2;
      let text = minor === undefined ? "–" : money(minor, entry.currency);
      const style = { ...options, size: 8, tabular: true };
      if (minor !== undefined && pen.width(text, { ...style, size: 5 }) > width) text = pen.clean(compactMoney(minor, entry.currency)) || text;
      const fitted = pen.fit(text, width, style, 5);
      pen.text(fitted.text, col.x + col.w - TABLE_PAD, first, { ...options, size: fitted.size, align: "right", tabular: true });
    };
    const remaining = remainingOf(entry);
    money1("amount", entry.amountMinor, { font: "semibold", color: settled ? palette.slate : palette.ink });
    money1("paid", entry.paidMinor > 0 ? entry.paidMinor : undefined, { font: "regular", color: settled ? quiet : palette.slate });
    money1("open", remaining > 0 ? remaining : undefined, { font: remaining > 0 ? "bold" : "regular", color: remaining > 0 ? tones[dir].text : quiet });

    const status = column("status");
    const tone: Tone = settled ? "slate" : entry.paidMinor > 0 && remaining > 0 ? "gold" : "violet";
    const label = settled ? "Settled" : tone === "gold" ? "Part paid" : "Open";
    const pillWidth = pen.width(label, { font: "bold", size: 6.8, spacing: 0.2 }) + 12;
    const centreY = first - MID * TITLE_SIZE;
    doc.roundedRect(status.x + TABLE_PAD, centreY - 6.5, pillWidth, 13, 6.5).fill(tones[tone].fill);
    pen.text(label, status.x + TABLE_PAD + 6, centreY + MID * 6.8, { font: "bold", size: 6.8, color: tones[tone].text, spacing: 0.2 });

    y += row.height;
    doc.moveTo(MARGIN, y).lineTo(CONTENT_RIGHT, y).lineWidth(0.5).strokeColor(palette.line).stroke();
  };

  const rows = statement.entries.map(layoutRow);
  // The heading, the column header and the first row always travel together.
  ensure(40 + (statement.entryCount > statement.entries.length ? 16 : 0) + HEADER_H + (rows[0]?.height ?? 60));
  drawSectionHeading();
  if (rows.length === 0) {
    doc.roundedRect(MARGIN, y, CONTENT_W, 54, 12).fill(palette.panel);
    pen.text("No entries between you yet.", PAGE_W / 2, y + 31, { font: "semibold", size: 10, color: palette.slate, align: "center" });
    y += 54;
  } else {
    drawTableHeader();
    for (const row of rows) {
      if (ensure(row.height)) drawTableHeader();
      drawRow(row);
    }
  }

  // ---- footers (every page, now that the page count is known) ------------------------------------------------------

  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    const lineY = PAGE_H - 42;
    doc.moveTo(MARGIN, lineY).lineTo(CONTENT_RIGHT, lineY).lineWidth(0.5).strokeColor(palette.line).stroke();
    pen.text("LenaDena keeps this record for you both. It never moves money.", MARGIN, lineY + 14, { font: "regular", size: 7.5, color: palette.slate });
    pen.text(`Page ${index + 1} of ${range.count}`, CONTENT_RIGHT, lineY + 14, { font: "semibold", size: 7.5, color: palette.slate, align: "right" });
  }
}

/**
 * Renders the statement as a multi-page A4 PDF. The figures are exactly the snapshot in `statement`; nothing is looked
 * up or recalculated beyond what each entry still has open.
 */
export async function renderStatementPdf(statement: StatementData): Promise<Buffer> {
  const fonts = loadFontPaths();
  const logoPath = findEmailLogoFile();
  const created = validDate(statement.generatedAt) ?? new Date();

  return new Promise<Buffer>((resolve, reject) => {
    try {
      const owner = cleanText(statement.ownerName, 80) ?? "A friend";
      const person = cleanText(statement.personName, 80) ?? "you";
      const doc = new PDFDocument({
        size: "A4",
        margin: 0,
        autoFirstPage: false,
        bufferPages: true,
        compress: true,
        pdfVersion: "1.4",
        lang: "en-GB",
        displayTitle: true,
        font: fonts.regular,
        info: {
          Title: `Statement: ${owner} and ${person}`,
          Author: brand.name,
          Creator: brand.name,
          Producer: brand.name,
          Subject: "Statement of account",
          CreationDate: created,
        },
      });
      for (const key of FONT_KEYS) doc.registerFont(fontName(key), fonts[key]);

      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      drawStatement(doc, statement, logoPath);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
