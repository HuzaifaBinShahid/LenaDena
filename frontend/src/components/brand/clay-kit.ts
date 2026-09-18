// Pure clay illustration kit: colour ramps, glyph paths, geometry helpers and id helpers.
// No React or React Native imports, so Vitest can run it (see clay-kit.test.ts). `Clay.tsx` draws with it.

export type ClayTone = "violet" | "lavender" | "gold" | "mint" | "coral" | "cloud" | "lavenderCloud";
export type ClayRamp = { hi: string; light: string; base: string; shade: string; deep: string; edge: string };
export type ClaySurface = "light" | "dark";
export type ClayDetail = "full" | "low";

/** Fixed brand material. Coloured ramps never change with the theme; only `surface` does, and dimmed art swaps the paper tones (see `clayRampFor`). */
export const clayRamps: Record<ClayTone, ClayRamp> = {
  violet: { hi: "#EEE9FF", light: "#957EFA", base: "#7657F6", shade: "#6040CD", deep: "#4B2AA4", edge: "#321C6F" },
  lavender: { hi: "#FCFAFF", light: "#F0ECFF", base: "#B5A5FF", shade: "#957EFA", deep: "#7657F6", edge: "#6040CD" },
  gold: { hi: "#FFF3E2", light: "#F8D29D", base: "#F4C27A", shade: "#DDA657", deep: "#C78A35", edge: "#8F632F" },
  mint: { hi: "#E8FAF4", light: "#A9F0D6", base: "#6FE0B8", shade: "#41BD98", deep: "#139A78", edge: "#116759" },
  coral: { hi: "#FDECF1", light: "#FFADBF", base: "#FF8DA6", shade: "#F47894", deep: "#E86383", edge: "#9B4360" },
  cloud: { hi: "#FFFFFF", light: "#FCFAFF", base: "#F0ECFF", shade: "#DCD4FF", deep: "#C9BDFF", edge: "#A08BFC" },
  lavenderCloud: { hi: "#FFFFFF", light: "#F0ECFF", base: "#DCD4FF", shade: "#B5A5FF", deep: "#957EFA", edge: "#7657F6" },
};

/** The pale "paper" materials: trays, clouds, receipt paper, calendar pages and platforms. */
export type ClayPaperTone = "cloud" | "lavenderCloud";

/**
 * The paper materials at dusk, for art drawn on the dark theme's canvas and cards. Near-white paper would glow
 * there, so it becomes the same lavender clay one light step down; coloured materials keep their ramps.
 */
export const clayDuskRamps: Record<ClayPaperTone, ClayRamp> = {
  cloud: { hi: "#E4DDFF", light: "#C9BEF7", base: "#A594E3", shade: "#8573CC", deep: "#6A57B2", edge: "#4B3990" },
  lavenderCloud: { hi: "#D2C7FB", light: "#B3A4EE", base: "#8F7DDA", shade: "#735FC4", deep: "#5B47A9", edge: "#3F2D85" },
};

function isPaperTone(tone: ClayTone): tone is ClayPaperTone {
  return tone === "cloud" || tone === "lavenderCloud";
}

/** The ramp a piece paints with: dimmed art swaps only the paper tones for their dusk ramps. */
export function clayRampFor(tone: ClayTone, dim: boolean): ClayRamp {
  return dim && isPaperTone(tone) ? clayDuskRamps[tone] : clayRamps[tone];
}

/** Pure white inside paper gradients (the lit top of a page or rim). Dimmed paper tops out at its dusk `hi`. */
export function clayPaperWhite(dim: boolean): string {
  return dim ? clayDuskRamps.cloud.hi : "#FFFFFF";
}

export type ClayGlyph = "exchange" | "ld" | "check" | "plus" | "arrow-in" | "arrow-out" | "clock" | "people" | "receipt";

export type ClayGlyphLayer = {
  d: string;
  mode: "stroke" | "fill";
  opacity?: number;
  /** Drawn in the ramp's `deep` colour, on the face pass only. */
  accent?: boolean;
  /** Overrides the glyph `strokeWidth` for a stroke layer; on a fill layer it adds an outline in the fill colour. */
  strokeWidth?: number;
};

export type ClayGlyphSpec = {
  box: readonly [minX: number, minY: number, size: number];
  strokeWidth: number;
  layers: readonly ClayGlyphLayer[];
  dot?: { cx: number; cy: number; r: number; color: string };
};

const BOX24 = [0, 0, 24] as const;

export const clayGlyphs: Record<ClayGlyph, ClayGlyphSpec> = {
  exchange: { box: BOX24, strokeWidth: 3, layers: [{ d: "M5 8.5H18 M14.5 5L18 8.5L14.5 12 M19 15.5H6 M9.5 12L6 15.5L9.5 19", mode: "stroke" }] },
  check: { box: BOX24, strokeWidth: 3.4, layers: [{ d: "M6.5 12.5L10.5 16.5L17.5 8", mode: "stroke" }] },
  plus: { box: BOX24, strokeWidth: 3, layers: [{ d: "M12 6.5V17.5 M6.5 12H17.5", mode: "stroke" }] },
  "arrow-in": { box: BOX24, strokeWidth: 3, layers: [{ d: "M12 5.5V18 M7 13L12 18L17 13", mode: "stroke" }] },
  "arrow-out": { box: BOX24, strokeWidth: 3, layers: [{ d: "M12 18.5V6 M7 11L12 6L17 11", mode: "stroke" }] },
  clock: { box: BOX24, strokeWidth: 2.6, layers: [{ d: "M12 4.5A7.5 7.5 0 1 0 12 19.5A7.5 7.5 0 1 0 12 4.5Z M12 8.5V12L14.6 13.6", mode: "stroke" }] },
  people: {
    box: BOX24,
    strokeWidth: 0,
    layers: [
      { d: "M16.6 8.4m-2.9 0a2.9 2.9 0 1 0 5.8 0a2.9 2.9 0 1 0 -5.8 0", mode: "fill", opacity: 0.75 },
      { d: "M15.6 13.7c.4-.1.7-.1 1.1-.1 2.9 0 5.1 2.3 5.1 5.5 0 .5-.4.9-.9.9h-3.3c.1-.3.1-.6.1-.9 0-2.2-.8-4.1-2.1-5.4Z", mode: "fill", opacity: 0.75 },
      { d: "M9 8m-3.6 0a3.6 3.6 0 1 0 7.2 0a3.6 3.6 0 1 0 -7.2 0", mode: "fill" },
      { d: "M2.5 20.2c0-3.9 2.9-6.7 6.5-6.7s6.5 2.8 6.5 6.7c0 .5-.4.8-.9.8H3.4c-.5 0-.9-.3-.9-.8Z", mode: "fill" },
    ],
  },
  receipt: {
    box: BOX24,
    strokeWidth: 1.8,
    layers: [
      { d: "M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21Z", mode: "fill", strokeWidth: 1.2 },
      { d: "M9 8h6M9 12h6M9 16h3", mode: "stroke", accent: true },
    ],
  },
  ld: {
    box: [289, 278, 476],
    strokeWidth: 58,
    layers: [
      { d: "M318 338v284c0 46 26 72 72 72h40", mode: "stroke" },
      { d: "M510 338v356", mode: "stroke" },
      { d: "M510 338h48c118 0 178 68 178 178s-60 178-178 178h-48", mode: "stroke" },
    ],
    dot: { cx: 706, cy: 354, r: 34, color: "#A9F0D6" },
  },
};

export type ClayName = "coin" | "coin-flat" | "coin-stack" | "cloud" | "puff" | "wallet" | "receipt" | "people" | "badge" | "calendar" | "empty";

export const clayViewBox: Record<ClayName, { w: number; h: number }> = {
  coin: { w: 120, h: 120 },
  "coin-flat": { w: 120, h: 72 },
  "coin-stack": { w: 132, h: 236 },
  cloud: { w: 200, h: 130 },
  puff: { w: 60, h: 48 },
  wallet: { w: 160, h: 140 },
  receipt: { w: 120, h: 150 },
  people: { w: 140, h: 128 },
  badge: { w: 120, h: 120 },
  calendar: { w: 120, h: 120 },
  empty: { w: 200, h: 160 },
};

/** Below these widths (points) a piece stops reading as clay; use `Icon` on a tinted tile instead. */
export const clayMinSize: Record<ClayName, number> = {
  coin: 40,
  "coin-flat": 20,
  "coin-stack": 96,
  cloud: 48,
  puff: 20,
  wallet: 88,
  receipt: 72,
  people: 88,
  badge: 40,
  calendar: 56,
  empty: 112,
};

/**
 * Thinnest stroke (viewBox units) that only "full" detail draws: lips, slot lips, grooves, stitching.
 * 0 means the piece has no optional strokes, so only the size rule applies.
 */
export const clayOptionalStroke: Record<ClayName, number> = {
  coin: 2, // slot lip
  "coin-flat": 2, // engraving ring
  "coin-stack": 1, // disc groove
  cloud: 0,
  puff: 0,
  wallet: 1.6, // stitching
  receipt: 0.9, // stamp badge lip at r 12
  people: 1.13, // accessory badge lip at r 15
  badge: 3, // lip
  calendar: 0,
  empty: 1.95, // reviews badge lip at r 26
};

export const CLAY_LOW_DETAIL_SIZE = 64;
export const CLAY_MIN_HAIRLINE = 0.75;

/** "low" drops bounce arcs, lips, slot lips, depth passes, grooves, stitching and secondary speculars. */
export function clayDetailFor(name: ClayName, size: number): ClayDetail {
  if (!(size >= CLAY_LOW_DETAIL_SIZE)) return "low";
  const stroke = clayOptionalStroke[name];
  if (stroke > 0 && (stroke * size) / clayViewBox[name].w < CLAY_MIN_HAIRLINE) return "low";
  return "full";
}

/** Height in points for a piece drawn `size` points wide. */
export function clayHeightFor(name: ClayName, size: number): number {
  const vb = clayViewBox[name];
  return Math.round((size * vb.h) / vb.w);
}

/** SVG id prefix, unique per instance. react-native-svg reads `url(#id)` with a regex, so only [A-Za-z0-9_-] survive. */
export function clayIdPrefix(reactId: string, name: string): string {
  return `clay-${name.replace(/[^A-Za-z0-9_-]/g, "")}-${reactId.replace(/[^A-Za-z0-9_-]/g, "")}`;
}

/** Rounds to 2 decimals and never prints "-0". */
export function r2(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}

function r4(value: number): number {
  const rounded = Math.round(value * 10000) / 10000;
  return rounded === 0 ? 0 : rounded;
}

/** A circle swept along (dx, dy): the silhouette of a coin edge or a puck side. Closed path. */
export function sweptCircle(cx: number, cy: number, r: number, dx: number, dy: number): string {
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * r;
  const ny = (dx / len) * r;
  const radius = r2(r);
  return (
    `M${r2(cx + nx)} ${r2(cy + ny)}L${r2(cx + dx + nx)} ${r2(cy + dy + ny)}` +
    `A${radius} ${radius} 0 0 0 ${r2(cx + dx - nx)} ${r2(cy + dy - ny)}` +
    `L${r2(cx - nx)} ${r2(cy - ny)}` +
    `A${radius} ${radius} 0 0 0 ${r2(cx + nx)} ${r2(cy + ny)}Z`
  );
}

/** The visible front side band of a flat disc: an ellipse face (rx, ry) with thickness t. Closed path. */
export function sideBand(cx: number, cy: number, rx: number, ry: number, t: number): string {
  const left = r2(cx - rx);
  const right = r2(cx + rx);
  const top = r2(cy);
  const bottom = r2(cy + t);
  return `M${left} ${top}V${bottom}A${r2(rx)} ${r2(ry)} 0 0 0 ${right} ${bottom}V${top}A${r2(rx)} ${r2(ry)} 0 0 1 ${left} ${top}Z`;
}

/** Four-point sparkle. Same formula as SpaceBackdrop's, copied here rather than imported (that file is frozen). */
export function sparklePath(x: number, y: number, size: number): string {
  const waist = size * 0.2;
  const p = (px: number, py: number) => `${r2(px)} ${r2(py)}`;
  return `M${p(x, y - size)} L${p(x + waist, y - waist)} L${p(x + size, y)} L${p(x + waist, y + waist)} L${p(x, y + size)} L${p(x - waist, y + waist)} L${p(x - size, y)} L${p(x - waist, y - waist)} Z`;
}

/** Arc along a circle from `fromDeg` to `toDeg` (screen angles, clockwise). Open path for rim light strokes. */
export function arcPath(cx: number, cy: number, r: number, fromDeg: number, toDeg: number): string {
  const a0 = (fromDeg * Math.PI) / 180;
  const a1 = (toDeg * Math.PI) / 180;
  const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
  return `M${r2(cx + r * Math.cos(a0))} ${r2(cy + r * Math.sin(a0))}A${r2(r)} ${r2(r)} 0 ${large} 1 ${r2(cx + r * Math.cos(a1))} ${r2(cy + r * Math.sin(a1))}`;
}

/**
 * Places a glyph so its box is centred on (cx, cy) and `box` units wide:
 * `translate(cx−box/2 cy−box/2) scale(box/size) translate(−minX −minY)`.
 * Positions are rounded to 2 decimals; the scale keeps 4, because the `ld` box is 476 units wide.
 */
export function glyphTransform(glyph: ClayGlyph, cx: number, cy: number, box: number): string {
  const [minX, minY, size] = clayGlyphs[glyph].box;
  const base = `translate(${r2(cx - box / 2)} ${r2(cy - box / 2)}) scale(${r4(box / size)})`;
  return minX === 0 && minY === 0 ? base : `${base} translate(${-minX} ${-minY})`;
}

/** Body of a people figure standing on `baseY`, scaled by `s`. Closed path. */
export function figureBody(x: number, baseY: number, s: number): string {
  const k = (n: number) => n * s;
  return (
    `M${r2(x - k(22))} ${r2(baseY)}V${r2(baseY - k(16))}` +
    `Q${r2(x - k(22))} ${r2(baseY - k(40))} ${r2(x)} ${r2(baseY - k(40))}` +
    `Q${r2(x + k(22))} ${r2(baseY - k(40))} ${r2(x + k(22))} ${r2(baseY - k(16))}` +
    `V${r2(baseY)}Q${r2(x)} ${r2(baseY + k(5))} ${r2(x - k(22))} ${r2(baseY)}Z`
  );
}

export type ClayStop = readonly [offset: number, color: string, opacity: number];

/** Shared shading presets. Every fade ends on its own hex at opacity 0 (never a keyword colour), so iOS shows no grey fringe. */
export const clayMaterial = {
  aoLight: [[0, "#4B2AA4", 0.26], [0.55, "#4B2AA4", 0.1], [1, "#4B2AA4", 0]],
  aoDark: [[0, "#0D0720", 0.6], [0.55, "#0D0720", 0.25], [1, "#0D0720", 0]],
  glow: [[0, "#B5A5FF", 0.24], [0.6, "#B5A5FF", 0.08], [1, "#B5A5FF", 0]],
  glowMint: [[0, "#6FE0B8", 0.22], [0.6, "#6FE0B8", 0.07], [1, "#6FE0B8", 0]],
  specular: [[0, "#FFFFFF", 0.8], [1, "#FFFFFF", 0]],
} as const satisfies Record<string, readonly ClayStop[]>;

/** Contact shadow of one clay object resting on another: the lower material's `edge` colour. */
export function contactStops(edge: string): readonly ClayStop[] {
  return [[0, edge, 0.5], [0.6, edge, 0.2], [1, edge, 0]];
}

export const CLAY_RECEIPT_PAPER = "M24 14Q24 8 30 8H90Q96 8 96 14V128L88 134L80 128L72 134L64 128L56 134L48 128L40 134L32 128L24 134Z";
export const CLAY_CALENDAR_HEADER = "M18 38Q18 22 34 22H82Q98 22 98 38V44H18Z";

export const clayStackDiscs = [
  { cx: 66, cy: 206 },
  { cx: 62, cy: 184 },
  { cx: 68, cy: 162 },
  { cx: 64, cy: 140 },
] as const;

export const clayCloudLobes = [
  { cx: 96, cy: 58, r: 44 },
  { cx: 140, cy: 72, r: 34 },
  { cx: 166, cy: 92, r: 22 },
  { cx: 58, cy: 80, r: 34 },
  { cx: 34, cy: 98, r: 20 },
] as const;
export const clayCloudBase = { x: 34, y: 84, width: 132, height: 32, rx: 16 } as const;
/** Bounding box of the cloud silhouette, (14,14)–(188,118). */
export const clayCloudBounds = { x: 14, y: 14, width: 174, height: 104 } as const;

/** Full circle as two clockwise arcs. Closed path. */
export function circlePath(cx: number, cy: number, r: number): string {
  const radius = r2(r);
  return `M${r2(cx - r)} ${r2(cy)}A${radius} ${radius} 0 0 1 ${r2(cx + r)} ${r2(cy)}A${radius} ${radius} 0 0 1 ${r2(cx - r)} ${r2(cy)}Z`;
}

/** Rounded rectangle traced clockwise from the top-left corner. Closed path. */
export function roundedRectPath(x: number, y: number, width: number, height: number, radius: number): string {
  const rr = r2(Math.min(radius, width / 2, height / 2));
  const right = r2(x + width);
  const bottom = r2(y + height);
  return (
    `M${r2(x + rr)} ${r2(y)}H${r2(x + width - rr)}A${rr} ${rr} 0 0 1 ${right} ${r2(y + rr)}` +
    `V${r2(y + height - rr)}A${rr} ${rr} 0 0 1 ${r2(x + width - rr)} ${bottom}` +
    `H${r2(x + rr)}A${rr} ${rr} 0 0 1 ${r2(x)} ${r2(y + height - rr)}` +
    `V${r2(y + rr)}A${rr} ${rr} 0 0 1 ${r2(x + rr)} ${r2(y)}Z`
  );
}

/** Transform that fits the cloud's 174-unit-wide silhouette into a box starting at (bx, by) and `bw` wide. */
export function cloudFitTransform(bx: number, by: number, bw: number): string {
  const k = bw / clayCloudBounds.width;
  return `translate(${r2(bx - clayCloudBounds.x * k)} ${r2(by - clayCloudBounds.y * k)}) scale(${r4(k)})`;
}

export const clayPeopleFigures = [
  { tone: "lavender", x: 46, baseY: 94, s: 0.8 },
  { tone: "mint", x: 96, baseY: 94, s: 0.8 },
  { tone: "violet", x: 70, baseY: 106, s: 1 },
] as const;

/** Path strings for the fixed catalogue geometry, computed once at module load. */
export const clayPaths = {
  /**
   * Cloud clip: every lobe and the base as clockwise sub-paths of ONE path. react-native-svg clips with
   * even-odd unless told otherwise, and mixed native shapes may wind differently, so the cloud uses this
   * single consistently wound path with `clipRule="nonzero"` to get a true union on iOS, Android and web.
   */
  cloudSilhouette:
    clayCloudLobes.map((lobe) => circlePath(lobe.cx, lobe.cy, lobe.r)).join("") +
    roundedRectPath(clayCloudBase.x, clayCloudBase.y, clayCloudBase.width, clayCloudBase.height, clayCloudBase.rx),
  coinEdge: sweptCircle(54, 52, 40, 8, 7),
  coinBounce: arcPath(54 + 8 * 0.55, 52 + 7 * 0.55, 40, 10, 80),
  flatBand: sideBand(60, 32, 44, 16, 10),
  stackBands: clayStackDiscs.map((disc) => sideBand(disc.cx, disc.cy, 52, 13, 18)),
  stackGrooves: clayStackDiscs.map((disc) => `M${disc.cx - 52} ${disc.cy + 9}A52 13 0 0 0 ${disc.cx + 52} ${disc.cy + 9}`),
  stackRims: clayStackDiscs.map((disc) => `M${disc.cx - 52} ${disc.cy}A52 13 0 0 0 ${disc.cx + 52} ${disc.cy}`),
  stackSparkleBig: sparklePath(120, 18, 12),
  stackSparkleSmall: sparklePath(8, 98, 8),
  badgeEdge: sweptCircle(60, 54, 40, 0, 9),
  peoplePlatform: sideBand(70, 100, 58, 14, 9),
  peopleBodies: clayPeopleFigures.map((figure) => figureBody(figure.x, figure.baseY, figure.s)),
  trayWall: sideBand(100, 108, 76, 22, 14),
  trayHighlight: "M40 120Q100 138 160 120",
  emptySparkleBig: sparklePath(166, 36, 7),
  emptySparkleSmall: sparklePath(28, 98, 5),
} as const;
