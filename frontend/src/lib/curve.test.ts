import { describe, expect, it } from "vitest";
import { areaPath, chartX, linePath, monotoneSegments, nearestIndex, scaleSeries, sparkPath, type Point } from "./curve";

const W = 342;
const H = 176;
const Y_TOP = 52;
const Y_BASE = 160;
const PAD_X = 24;
const box = { width: W, top: Y_TOP, base: Y_BASE, padX: PAD_X };

/** Samples every cubic segment of an SVG path made of M, L and C commands. */
function samplePath(d: string, samplesPerSegment = 40): Point[] {
  const tokens = d.trim().match(/[MLCZ]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const out: Point[] = [];
  let cursor: Point = { x: 0, y: 0 };
  let index = 0;
  const num = () => Number(tokens[index++]);
  while (index < tokens.length) {
    const command = tokens[index++];
    if (command === "M" || command === "L") {
      cursor = { x: num(), y: num() };
      out.push(cursor);
    } else if (command === "C") {
      const c1 = { x: num(), y: num() };
      const c2 = { x: num(), y: num() };
      const end = { x: num(), y: num() };
      for (let s = 1; s <= samplesPerSegment; s++) {
        const t = s / samplesPerSegment;
        const u = 1 - t;
        out.push({
          x: u * u * u * cursor.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * end.x,
          y: u * u * u * cursor.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * end.y,
        });
      }
      cursor = end;
    } else if (command === "Z") {
      continue;
    } else {
      throw new Error(`Unexpected token ${String(command)} in ${d}`);
    }
  }
  return out;
}

function expectWithin(samples: Point[], min: number, max: number) {
  const tolerance = 0.11; // coordinates are rounded to 0.1
  for (const sample of samples) {
    expect(Number.isFinite(sample.y)).toBe(true);
    expect(sample.y).toBeGreaterThanOrEqual(min - tolerance);
    expect(sample.y).toBeLessThanOrEqual(max + tolerance);
  }
}

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

describe("chartX", () => {
  it("puts the first and last points on the padding edges", () => {
    expect(chartX(W, 7, 0, PAD_X)).toBe(PAD_X);
    expect(chartX(W, 7, 6, PAD_X)).toBe(W - PAD_X);
    expect(chartX(W, 5, 2, PAD_X)).toBe(W / 2);
  });

  it("centres a single point instead of dividing by zero", () => {
    expect(chartX(W, 1, 0, PAD_X)).toBe(W / 2);
    expect(chartX(W, 0, 0, PAD_X)).toBe(W / 2);
  });
});

describe("nearestIndex", () => {
  it("picks the closest point", () => {
    const step = (W - 2 * PAD_X) / 6;
    expect(nearestIndex(PAD_X, W, 7, PAD_X)).toBe(0);
    expect(nearestIndex(PAD_X + step * 2.4, W, 7, PAD_X)).toBe(2);
    expect(nearestIndex(PAD_X + step * 2.6, W, 7, PAD_X)).toBe(3);
    expect(nearestIndex(W - PAD_X, W, 7, PAD_X)).toBe(6);
  });

  it("clamps outside the chart and on degenerate input", () => {
    expect(nearestIndex(-500, W, 7, PAD_X)).toBe(0);
    expect(nearestIndex(0, W, 7, PAD_X)).toBe(0);
    expect(nearestIndex(W, W, 7, PAD_X)).toBe(6);
    expect(nearestIndex(W * 3, W, 7, PAD_X)).toBe(6);
    expect(nearestIndex(100, W, 1, PAD_X)).toBe(0);
    expect(nearestIndex(100, W, 0, PAD_X)).toBe(0);
    expect(nearestIndex(Number.NaN, W, 7, PAD_X)).toBe(0);
    expect(nearestIndex(10, 20, 7, PAD_X)).toBe(0);
  });
});

describe("scaleSeries", () => {
  it("maps the maximum to the top and zero to the base", () => {
    const points = scaleSeries([0, 50, 100, 0, 25], box);
    expect(points.map((point) => point.y)).toEqual([Y_BASE, 106, Y_TOP, Y_BASE, 133]);
    expect(points[0]?.x).toBe(PAD_X);
    expect(points[4]?.x).toBe(W - PAD_X);
  });

  it("lifts tiny positive values by the minimum bump", () => {
    const points = scaleSeries([1, 100000, 0], box);
    expect(points[0]?.y).toBe(Y_BASE - 6);
    expect(points[2]?.y).toBe(Y_BASE);
    expect(scaleSeries([1, 100000], { ...box, minBump: 10 })[0]?.y).toBe(Y_BASE - 10);
  });

  it("keeps an empty or all-zero series on the base", () => {
    expect(scaleSeries([0, 0, 0, 0, 0], box).every((point) => point.y === Y_BASE)).toBe(true);
    expect(scaleSeries([], box)).toEqual([]);
    const junk = scaleSeries([Number.NaN, -40, Number.POSITIVE_INFINITY, 0], box);
    expect(junk.every((point) => point.y === Y_BASE && Number.isFinite(point.x))).toBe(true);
  });
});

describe("monotone curve", () => {
  it("never leaves the input range for step data", () => {
    const steps = [
      [0, 0, 240000, 0, 0, 0, 0],
      [0, 0, 0, 0, 500],
      [100, 100, 0, 0, 100, 100],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [9, 0, 9, 0, 9, 0],
    ];
    for (const values of steps) {
      const points = scaleSeries(values, box);
      const ys = points.map((point) => point.y);
      const samples = samplePath(linePath(points, W));
      expectWithin(samples, Math.min(...ys), Math.max(...ys));
      expectWithin(samplePath(areaPath(points, W, H)), Math.min(...ys), H);
    }
  });

  it("never leaves the input range for random data", () => {
    const random = seeded(20260914);
    for (let run = 0; run < 200; run++) {
      const count = 4 + Math.floor(random() * 12);
      const points = Array.from({ length: count }, (_, index) => ({ x: index * (10 + random() * 40), y: random() * 300 - 50 }));
      const ys = points.map((point) => point.y);
      const d = `M${points[0]?.x ?? 0} ${points[0]?.y ?? 0}${monotoneSegments(points)}`;
      expectWithin(samplePath(d), Math.min(...ys), Math.max(...ys));
    }
  });

  it("passes through every input point", () => {
    const points = scaleSeries([0, 30, 10, 80, 0], box);
    const d = monotoneSegments(points);
    const ends = [...d.matchAll(/C[^C]*? (-?[\d.]+) (-?[\d.]+)(?= C|$)/g)].map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));
    expect(ends).toHaveLength(points.length - 1);
    ends.forEach((end, index) => {
      expect(end.x).toBeCloseTo(points[index + 1]?.x ?? Number.NaN, 0);
      expect(end.y).toBeCloseTo(points[index + 1]?.y ?? Number.NaN, 0);
    });
  });

  it("returns no segments for fewer than two points", () => {
    expect(monotoneSegments([])).toBe("");
    expect(monotoneSegments([{ x: 1, y: 2 }])).toBe("");
  });

  it("rounds coordinates to one decimal", () => {
    const d = monotoneSegments(scaleSeries([3, 7, 1, 9, 4, 11, 2], box));
    for (const token of d.match(/-?\d+(?:\.\d+)?/g) ?? []) {
      expect(token.split(".")[1]?.length ?? 0).toBeLessThanOrEqual(1);
    }
  });
});

describe("linePath and areaPath", () => {
  it("draws a flat baseline for a flat series", () => {
    const points = scaleSeries([0, 0, 0, 0, 0], box);
    const line = linePath(points, W);
    expect(line.startsWith(`M0 ${Y_BASE} L${PAD_X} ${Y_BASE}`)).toBe(true);
    expect(line.endsWith(` L${W} ${Y_BASE}`)).toBe(true);
    expect(samplePath(line).every((sample) => Math.abs(sample.y - Y_BASE) < 1e-9)).toBe(true);
    expect(line).not.toContain("NaN");
  });

  it("extends the curve to both edges and closes the area", () => {
    const points = scaleSeries([0, 20, 5, 40], box);
    const line = linePath(points, W);
    expect(line.startsWith(`M0 ${Y_BASE} L${PAD_X} ${Y_BASE} C`)).toBe(true);
    expect(line.endsWith(` L${W} ${Y_TOP}`)).toBe(true);
    const area = areaPath(points, W, H);
    expect(area).toBe(`${line} L${W} ${H} L0 ${H} Z`);
  });

  it("returns empty paths for empty input", () => {
    expect(linePath([], W)).toBe("");
    expect(areaPath([], W, H)).toBe("");
  });
});

describe("sparkPath", () => {
  it("draws a mid-height flat line when every value is equal", () => {
    expect(sparkPath([5, 5, 5, 5], 60, 30)).toEqual({ d: "M3 15 L57 15", end: { x: 57, y: 15 }, flat: true });
    expect(sparkPath([], 60, 30).flat).toBe(true);
    expect(sparkPath([7], 60, 30).flat).toBe(true);
    expect(sparkPath([0, 0, 0], 60, 30, 5)).toEqual({ d: "M5 15 L55 15", end: { x: 55, y: 15 }, flat: true });
  });

  it("normalises min to the bottom and max to the top inside the padding", () => {
    const result = sparkPath([10, 40, 20, 50], 60, 30);
    expect(result.flat).toBe(false);
    expect(result.d.startsWith("M3 27 C")).toBe(true);
    expect(result.end).toEqual({ x: 57, y: 3 });
    expectWithin(samplePath(result.d), 3, 27);
  });

  it("handles negative values without leaving the box", () => {
    const result = sparkPath([-400, 200, -100, 0, 50], 60, 30);
    expect(result.end.x).toBe(57);
    expectWithin(samplePath(result.d), 3, 27);
    expect(result.d).not.toContain("NaN");
  });
});
