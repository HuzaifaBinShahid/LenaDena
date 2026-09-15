import { describe, expect, it } from "vitest";
import { colors } from "../../theme/tokens";
import {
  circlePath,
  clayDetailFor,
  clayGlyphs,
  clayHeightFor,
  clayIdPrefix,
  clayMaterial,
  clayMinSize,
  clayPaths,
  clayRamps,
  clayViewBox,
  cloudFitTransform,
  glyphTransform,
  roundedRectPath,
  sideBand,
  sparklePath,
  sweptCircle,
  type ClayGlyph,
  type ClayName,
} from "./clay-kit";

const numbersIn = (path: string) => (path.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

describe("clay geometry helpers", () => {
  it("sweeps a circle into a closed silhouette that starts and ends on the same point", () => {
    const path = sweptCircle(54, 52, 40, 8, 7);
    expect(path.startsWith("M")).toBe(true);
    expect(path.endsWith("Z")).toBe(true);
    expect(path.match(/A/g)).toHaveLength(2);
    expect(path.match(/L/g)).toHaveLength(2);

    const start = path.match(/^M(-?[\d.]+) (-?[\d.]+)L/);
    const end = path.match(/(-?[\d.]+) (-?[\d.]+)Z$/);
    expect(start?.slice(1)).toEqual(end?.slice(1));

    // The start point sits on the face circle, perpendicular to the sweep direction.
    const [x, y] = [Number(start?.[1]), Number(start?.[2])];
    expect(Math.hypot(x - 54, y - 52)).toBeCloseTo(40, 1);
    expect((x - 54) * 8 + (y - 52) * 7).toBeCloseTo(0, 0);
  });

  it("sweeps straight down for the badge puck", () => {
    expect(sweptCircle(60, 54, 40, 0, 9)).toBe("M20 54L20 63A40 40 0 0 0 100 63L100 54A40 40 0 0 0 20 54Z");
    expect(clayPaths.badgeEdge).toBe(sweptCircle(60, 54, 40, 0, 9));
  });

  it("draws a closed side band from the left rim, down, across and back", () => {
    const path = sideBand(60, 32, 44, 16, 10);
    expect(path).toBe("M16 32V42A44 16 0 0 0 104 42V32A44 16 0 0 1 16 32Z");
    expect(path.endsWith("Z")).toBe(true);
  });

  it("rounds helper output to two decimals", () => {
    for (const value of numbersIn(sweptCircle(18, 34, 12.3456, 2.469, 2.1604))) {
      expect(Math.round(value * 100) / 100).toBe(value);
    }
    expect(sideBand(10, 10, 1 / 3, 1 / 7, 2 / 3)).not.toMatch(/\d\.\d{3}/);
  });

  it("copies the SpaceBackdrop sparkle formula", () => {
    expect(sparklePath(120, 18, 12)).toBe("M120 6 L122.4 15.6 L132 18 L122.4 20.4 L120 30 L117.6 20.4 L108 18 L117.6 15.6 Z");
  });

  it("precomputes the fixed catalogue paths at module load", () => {
    expect(clayPaths.stackBands).toHaveLength(4);
    expect(clayPaths.stackBands[0]).toBe(sideBand(66, 206, 52, 13, 18));
    expect(clayPaths.trayWall).toBe(sideBand(100, 108, 76, 22, 14));
    expect(clayPaths.peoplePlatform).toBe(sideBand(70, 100, 58, 14, 9));
    for (const path of [clayPaths.coinEdge, clayPaths.flatBand, ...clayPaths.stackBands, ...clayPaths.peopleBodies]) {
      expect(path.endsWith("Z")).toBe(true);
      expect(numbersIn(path).every(Number.isFinite)).toBe(true);
    }
  });

  it("winds every cloud clip sub-path clockwise so a nonzero clip is a true union", () => {
    expect(circlePath(96, 58, 44)).toBe("M52 58A44 44 0 0 1 140 58A44 44 0 0 1 52 58Z");
    expect(roundedRectPath(34, 84, 132, 32, 16)).toBe("M50 84H150A16 16 0 0 1 166 100V100A16 16 0 0 1 150 116H50A16 16 0 0 1 34 100V100A16 16 0 0 1 50 84Z");
    const subPaths = clayPaths.cloudSilhouette.split("Z").filter(Boolean);
    expect(subPaths).toHaveLength(6);
    const sweeps = [...clayPaths.cloudSilhouette.matchAll(/A[\d.]+ [\d.]+ 0 0 (\d)/g)].map((match) => match[1]);
    expect(sweeps.length).toBe(14);
    expect(new Set(sweeps)).toEqual(new Set(["1"]));
  });

  it("centres glyph boxes and fits the cloud silhouette", () => {
    expect(glyphTransform("check", 54, 52, 29.6)).toBe("translate(39.2 37.2) scale(1.2333)");
    expect(glyphTransform("ld", 54, 52, 29.6)).toBe("translate(39.2 37.2) scale(0.0622) translate(-289 -278)");
    expect(cloudFitTransform(14, 14, 174)).toBe("translate(0 0) scale(1)");
    expect(cloudFitTransform(356, 87, 108)).toBe("translate(347.31 78.31) scale(0.6207)");
  });
});

describe("clay ids", () => {
  it("prefixes ids per instance and strips characters react-native-svg cannot reference", () => {
    expect(clayIdPrefix("_r_1f_", "coin")).toBe("clay-coin-_r_1f_");
    expect(clayIdPrefix(":r3:", "coin-stack")).toBe("clay-coin-stack-r3");
    expect(clayIdPrefix("«r0» (x)", "empty")).toBe("clay-empty-r0x");
    expect(clayIdPrefix("a.b#c)", "splash")).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(clayIdPrefix(":r1:", "coin")).not.toBe(clayIdPrefix(":r2:", "coin"));
  });
});

describe("clay ramps", () => {
  it("uses upper-case six-digit hex for every ramp value and material stop", () => {
    for (const ramp of Object.values(clayRamps)) {
      for (const value of Object.values(ramp)) expect(value).toMatch(/^#[0-9A-F]{6}$/);
    }
    for (const stops of Object.values(clayMaterial)) {
      for (const [, color] of stops) expect(color).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it("fades every material preset to its own hex at opacity 0", () => {
    for (const stops of Object.values(clayMaterial)) {
      const first = stops[0];
      const last = stops[stops.length - 1];
      expect(last?.[1]).toBe(first?.[1]);
      expect(last?.[2]).toBe(0);
    }
  });

  it("anchors ramp values to the palette tokens", () => {
    expect(clayRamps.violet).toMatchObject({ hi: colors.violetSoft, base: colors.violet, deep: colors.violetStrong });
    expect(clayRamps.lavender).toMatchObject({ hi: colors.raised, light: colors.lavenderSoft, base: colors.lavender, deep: colors.violet });
    expect(clayRamps.gold).toMatchObject({ hi: colors.goldSoft, base: colors.goldBright, deep: colors.gold });
    expect(clayRamps.mint).toMatchObject({ hi: colors.limeSoft, light: colors.lime, base: colors.mintBright, deep: colors.mint });
    expect(clayRamps.coral).toMatchObject({ hi: colors.coralSoft, base: colors.coralBright, deep: colors.coral });
    expect(clayRamps.cloud).toMatchObject({ hi: colors.white, light: colors.raised, base: colors.lavenderSoft });
    expect(clayRamps.lavenderCloud).toMatchObject({ hi: colors.white, light: colors.lavenderSoft, shade: colors.lavender, edge: colors.violet });
  });
});

describe("clay sizing and detail", () => {
  it("drops to low detail under 64pt", () => {
    expect(clayDetailFor("coin", 63)).toBe("low");
    expect(clayDetailFor("coin", 64)).toBe("full");
    expect(clayDetailFor("badge", 40)).toBe("low");
    expect(clayDetailFor("cloud", 64)).toBe("full");
    expect(clayDetailFor("coin", Number.NaN)).toBe("low");
  });

  it("drops to low detail when an optional stroke would draw under 0.75pt", () => {
    // Disc grooves are 1 unit in a 132-unit-wide viewBox.
    expect(clayDetailFor("coin-stack", 98)).toBe("low");
    expect(clayDetailFor("coin-stack", 99)).toBe("full");
    expect(clayDetailFor("coin-stack", 132)).toBe("full");
    // Wallet stitching is 1.6 units in 160.
    expect(clayDetailFor("wallet", 74)).toBe("low");
    expect(clayDetailFor("wallet", 75)).toBe("full");
    expect(clayDetailFor("wallet", 112)).toBe("full");
    // The people accessory badge lip is 1.13 units in 140.
    expect(clayDetailFor("people", 92)).toBe("low");
    expect(clayDetailFor("people", 112)).toBe("full");
  });

  it("covers every piece with a viewBox, a minimum size and a rounded height", () => {
    const names: ClayName[] = ["coin", "coin-flat", "coin-stack", "cloud", "puff", "wallet", "receipt", "people", "badge", "calendar", "empty"];
    expect(Object.keys(clayViewBox).sort()).toEqual([...names].sort());
    expect(Object.keys(clayMinSize).sort()).toEqual([...names].sort());
    expect(clayViewBox["coin-stack"]).toEqual({ w: 132, h: 236 });
    expect(clayHeightFor("coin-stack", 132)).toBe(236);
    expect(clayHeightFor("empty", 148)).toBe(118);
    expect(clayHeightFor("receipt", 84)).toBe(105);
  });
});

describe("clay glyphs", () => {
  it("has exactly the ClayGlyph keys", () => {
    const keys: Record<ClayGlyph, true> = { exchange: true, ld: true, check: true, plus: true, "arrow-in": true, "arrow-out": true, clock: true, people: true, receipt: true };
    expect(Object.keys(clayGlyphs).sort()).toEqual(Object.keys(keys).sort());
  });

  it("uses the 24-unit box for every glyph except ld", () => {
    for (const [name, spec] of Object.entries(clayGlyphs)) {
      if (name === "ld") continue;
      expect(spec.box).toEqual([0, 0, 24]);
      expect(spec.layers.length).toBeGreaterThan(0);
    }
  });

  it("keeps the ld dot inside the ld box", () => {
    const { box, dot } = clayGlyphs.ld;
    const [minX, minY, size] = box;
    expect(dot).toBeDefined();
    if (!dot) return;
    expect(dot.cx - dot.r).toBeGreaterThanOrEqual(minX);
    expect(dot.cy - dot.r).toBeGreaterThanOrEqual(minY);
    expect(dot.cx + dot.r).toBeLessThanOrEqual(minX + size);
    expect(dot.cy + dot.r).toBeLessThanOrEqual(minY + size);
    expect(dot.color).toBe(colors.lime);
  });

  it("marks only the receipt lines as accent", () => {
    const accents = Object.entries(clayGlyphs).flatMap(([name, spec]) => spec.layers.filter((layer) => layer.accent).map(() => name));
    expect(accents).toEqual(["receipt"]);
  });
});
