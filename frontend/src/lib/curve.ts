// Pure chart geometry shared by AreaChart and Sparkline (D8). No react-native imports: Vitest runs this file.

export type Point = { x: number; y: number };

const round = (value: number) => Math.round(value * 10) / 10;
const finite = (value: number) => (Number.isFinite(value) ? value : 0);

/** x of point `index` in a series of `count` spread evenly between `padX` and `width - padX`. A single point sits in the middle. */
export function chartX(width: number, count: number, index: number, padX: number): number {
  "worklet";
  if (count <= 1) return width / 2;
  return padX + (index * (width - 2 * padX)) / (count - 1);
}

/** Index of the point nearest to `x`, clamped to [0, count - 1]. Safe to call on the UI thread. */
export function nearestIndex(x: number, width: number, count: number, padX: number): number {
  "worklet";
  if (count <= 1) return 0;
  const step = (width - 2 * padX) / (count - 1);
  if (!(step > 0)) return 0;
  const index = Math.round((x - padX) / step);
  if (!Number.isFinite(index)) return 0;
  return Math.min(count - 1, Math.max(0, index));
}

/**
 * Maps non-negative values onto a chart box: the largest value reaches `top`, zero sits on `base`.
 * Any positive value is lifted at least `minBump` (default 6) above the base so small entries still show.
 * When nothing is positive every point sits on the base. Negative or non-finite values count as 0.
 */
export function scaleSeries(
  values: readonly number[],
  box: { width: number; top: number; base: number; padX: number; minBump?: number },
): Point[] {
  const clean = values.map((value) => Math.max(0, finite(value)));
  const max = clean.length ? Math.max(...clean) : 0;
  const bump = box.minBump ?? 6;
  return clean.map((value, index) => {
    const x = chartX(box.width, clean.length, index, box.padX);
    if (max <= 0) return { x, y: box.base };
    let y = box.base - (value / max) * (box.base - box.top);
    if (value > 0) y = Math.min(y, box.base - bump);
    return { x, y };
  });
}

/**
 * Monotone cubic segments (Steffen / d3 curveMonotoneX slope rule) through `points`, starting at points[0].
 * End tangents are flat so the curve meets flat lead-ins smoothly. It never overshoots its input points.
 * Returns only the " C…" commands; coordinates are rounded to 0.1.
 */
export function monotoneSegments(points: readonly Point[]): string {
  const p = points;
  const n = p.length;
  if (n < 2) return "";
  const at = (k: number): Point => p[k] as Point;
  const m = p.slice(0, -1).map((pt, k) => {
    const next = at(k + 1);
    const dx = next.x - pt.x;
    return dx === 0 ? 0 : (next.y - pt.y) / dx;
  });
  const t = p.map((_, k) => {
    if (k === 0 || k === n - 1) return 0; // flat ends meet the flat lead-ins smoothly
    const a = m[k - 1] ?? 0;
    const b = m[k] ?? 0;
    return (Math.sign(a) + Math.sign(b)) * Math.min(Math.abs(a), Math.abs(b), 0.5 * Math.abs((a + b) / 2)) || 0;
  });
  let d = "";
  for (let k = 0; k < n - 1; k++) {
    const from = at(k);
    const to = at(k + 1);
    const h = (to.x - from.x) / 3;
    const t0 = t[k] ?? 0;
    const t1 = t[k + 1] ?? 0;
    d += ` C${round(from.x + h)} ${round(from.y + t0 * h)} ${round(to.x - h)} ${round(to.y - t1 * h)} ${round(to.x)} ${round(to.y)}`;
  }
  return d;
}

/** Full-width line: a flat lead-in from x 0, the monotone curve, then a flat lead-out to `width`. Empty input gives "". */
export function linePath(points: readonly Point[], width: number): string {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return "";
  return `M0 ${round(first.y)} L${round(first.x)} ${round(first.y)}${monotoneSegments(points)} L${round(width)} ${round(last.y)}`;
}

/** The line closed down to `height` for a filled area. Empty input gives "". */
export function areaPath(points: readonly Point[], width: number, height: number): string {
  const line = linePath(points, width);
  if (!line) return "";
  return `${line} L${round(width)} ${round(height)} L0 ${round(height)} Z`;
}

/**
 * Small sparkline path inside width × height with `pad` (default 3) on every side, normalised min → bottom, max → top.
 * A series with no spread (or fewer than two values) is a mid-height horizontal line with `flat: true`.
 */
export function sparkPath(
  values: readonly number[],
  width: number,
  height: number,
  pad = 3,
): { d: string; end: Point; flat: boolean } {
  const clean = values.map(finite);
  const min = clean.length ? Math.min(...clean) : 0;
  const max = clean.length ? Math.max(...clean) : 0;
  if (clean.length < 2 || max === min) {
    const y = round(height / 2);
    const end = { x: round(width - pad), y };
    return { d: `M${round(pad)} ${y} L${end.x} ${y}`, end, flat: true };
  }
  const top = pad;
  const bottom = height - pad;
  const points = clean.map((value, index) => ({
    x: chartX(width, clean.length, index, pad),
    y: bottom - ((value - min) / (max - min)) * (bottom - top),
  }));
  const first = points[0] as Point;
  const last = points[points.length - 1] as Point;
  return {
    d: `M${round(first.x)} ${round(first.y)}${monotoneSegments(points)}`,
    end: { x: round(last.x), y: round(last.y) },
    flat: false,
  };
}
