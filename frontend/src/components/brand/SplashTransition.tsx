import { createElement, useEffect, useId, useMemo, useRef, type ReactNode } from "react";
import type { ViewStyle } from "react-native";
import { StyleSheet, Text as NativeText, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  type AnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, ClipPath, Defs, Ellipse, G, LinearGradient as SvgLinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";
import { ClayParts, type ClayCoinTone, type ClayGlyphStyle } from "@/components/brand/Clay";
import { circlePath, clayDetailFor, clayIdPrefix, clayMaterial, clayRamps, cloudFitTransform, r2, type ClayDetail, type ClayGlyph } from "@/components/brand/clay-kit";
import { Icon } from "@/components/ui/Icon";
import { colors, motion } from "@/theme/tokens";

// Launch splash: a glossy clay "balance cloud" holding violet and mint balance bars, four orbiting coins
// (people, check, LD, receipt), lavender side clouds, puffs, gold tokens, the brand line and a progress pill.
// One linear clock drives the whole entrance; every piece reads it in a worklet, so nothing re-renders while it
// plays and nothing loops. Only transform and opacity animate. The overlay unmounts after `onFinish`.

type SplashTransitionProps = {
  onFinish: () => void;
};

type Clock = SharedValue<number>;
/** Artboard bounding box: x, y, width, height (artboard units, 390 × 380). */
type Box = readonly [x: number, y: number, width: number, height: number];
type Frame = { s: number; originX: number; originY: number };
type SplashLayout = Frame & {
  titleSize: number;
  titleLine: number;
  showEyebrow: boolean;
  copyTop: number;
  pillTop: number;
  pillLeft: number;
};

// Local background ramp (tints of plum and violetStrong). The base matches the native splash colour.
const BG_BASE = "#1A1037";
const BG_GRADIENT = ["#1A1037", "#1F1248", "#2C1662", "#3A1C77"] as const;
const BG_LOCATIONS = [0, 0.38, 0.72, 1] as const;

const ART_W = 390;
const ART_H = 380;
const GAP = 8;
const PILL_W = 176;
const PILL_H = 52;
const KNOB_TRAVEL = 124;
const INTRO_MS = 1460;
const EXIT_MS = 380;
/** Scene centre the coins orbit around. */
const ORBIT_X = 197;
const ORBIT_Y = 170;

const WHITE = colors.white;
const NIGHT = colors.night;
const LAVENDER_TEXT = colors.lavender;

const cloud = clayRamps.cloud;
const violet = clayRamps.violet;
const mint = clayRamps.mint;

type StopSpec = readonly [offset: number, color: string, opacity?: number];

const BAR_TONES: Record<"violet" | "mint", readonly StopSpec[]> = {
  violet: [[0, clayRamps.lavender.base], [0.25, violet.light], [0.6, violet.base], [1, violet.deep]],
  mint: [[0, mint.hi], [0.2, mint.light], [0.55, mint.base], [1, mint.deep]],
};

const LOBE_STOPS: readonly StopSpec[] = [[0, cloud.hi], [0.35, cloud.base], [0.72, cloud.shade], [1, cloud.edge]];
const UNIFIER_STOPS: readonly StopSpec[] = [[0, violet.deep, 0], [0.55, violet.deep, 0], [1, violet.deep, 0.3]];

/** Full ellipse as two clockwise arcs, wound like `circlePath`, so it can join a nonzero clip union. */
function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  return `M${r2(cx - rx)} ${r2(cy)}A${r2(rx)} ${r2(ry)} 0 0 1 ${r2(cx + rx)} ${r2(cy)}A${r2(rx)} ${r2(ry)} 0 0 1 ${r2(cx - rx)} ${r2(cy)}Z`;
}

type Lobe = { cx: number; cy: number; r: number };
const BACK_TOP_LOBES: readonly Lobe[] = [
  { cx: 112, cy: 140, r: 50 },
  { cx: 198, cy: 98, r: 66 },
  { cx: 280, cy: 132, r: 52 },
];
const BACK_FILLER = { cx: 196, cy: 190, rx: 110, ry: 44 } as const;
const BACK_LOW_LOBES: readonly Lobe[] = [
  { cx: 90, cy: 190, r: 42 },
  { cx: 304, cy: 184, r: 42 },
];
const FRONT_LOBES: readonly Lobe[] = [
  { cx: 130, cy: 238, r: 40 },
  { cx: 196, cy: 246, r: 44 },
  { cx: 262, cy: 238, r: 40 },
];

// Clip unions are ONE path of clockwise sub-paths with clipRule nonzero. react-native-svg clips even-odd by
// default on iOS and Android, so separate overlapping shapes would cut holes where they overlap.
const BACK_SILHOUETTE =
  [...BACK_TOP_LOBES, ...BACK_LOW_LOBES].map((lobe) => circlePath(lobe.cx, lobe.cy, lobe.r)).join("") +
  ellipsePath(BACK_FILLER.cx, BACK_FILLER.cy, BACK_FILLER.rx, BACK_FILLER.ry);
const FRONT_SILHOUETTE = FRONT_LOBES.map((lobe) => circlePath(lobe.cx, lobe.cy, lobe.r)).join("");

type GlintSpec = { cx: number; cy: number; rx: number; ry: number; rotate: number; opacity: number };
const BACK_GLINTS: readonly GlintSpec[] = [
  { cx: 176, cy: 64, rx: 22, ry: 12, rotate: -25, opacity: 0.95 },
  { cx: 96, cy: 116, rx: 13, ry: 7, rotate: -30, opacity: 0.8 },
  { cx: 266, cy: 108, rx: 12, ry: 6, rotate: -20, opacity: 0.8 },
];
const FRONT_GLINTS: readonly GlintSpec[] = [
  { cx: 116, cy: 218, rx: 10, ry: 5, rotate: -25, opacity: 0.8 },
  { cx: 182, cy: 222, rx: 14, ry: 6, rotate: -15, opacity: 0.85 },
  { cx: 250, cy: 216, rx: 10, ry: 5, rotate: -20, opacity: 0.8 },
];

/** Hero cloud group box and the bar clip inside it (group-relative 60,36; artboard x 100–292, y 60–236). */
const CLOUD_BOX: Box = [40, 24, 316, 276];
const BAR_CLIP = { x: 100, y: 60, width: 192, height: 176 } as const;

type BarSpec = { key: string; x: number; top: number; tone: "violet" | "mint"; stripe: number; rise: number; delay: number };
const BARS: readonly BarSpec[] = [
  { key: "a", x: 106, top: 120, tone: "violet", stripe: 47, rise: 120, delay: 320 },
  { key: "b", x: 154, top: 90, tone: "mint", stripe: 63, rise: 150, delay: 380 },
  { key: "c", x: 202, top: 134, tone: "violet", stripe: 39, rise: 106, delay: 440 },
  { key: "d", x: 250, top: 104, tone: "mint", stripe: 55, rise: 136, delay: 500 },
];

type SideCloudSpec = { key: string; box: Box; shift: number; delay: number; detail: ClayDetail };
const SIDE_CLOUDS: readonly SideCloudSpec[] = [
  { key: "c1", box: [356, 87, 108, 71], shift: 44, delay: 200, detail: "full" },
  { key: "c3", box: [350, 187, 64, 43], shift: 32, delay: 280, detail: "low" },
  { key: "c2", box: [-41, 202, 78, 51], shift: -40, delay: 160, detail: "low" },
];

type TokenSpec = { key: string; cx: number; cy: number; rx: number; ry: number; rotate: number; delay: number };
const BACK_TOKENS: readonly TokenSpec[] = [
  { key: "s1", cx: 86, cy: 77, rx: 14, ry: 6.5, rotate: -12, delay: 640 },
  { key: "s3", cx: 292, cy: 76, rx: 13, ry: 8, rotate: 22, delay: 700 },
];
const FRONT_TOKENS: readonly TokenSpec[] = [
  { key: "s2", cx: 68, cy: 150, rx: 13, ry: 8, rotate: 10, delay: 760 },
  { key: "s4", cx: 228, cy: 214, rx: 13, ry: 7, rotate: 28, delay: 820 },
];

type CoinSpec = { key: string; cx: number; cy: number; r: number; rotate: number; tone: ClayCoinTone; glyph: ClayGlyph; glyphStyle: ClayGlyphStyle; delay: number };
const COINS: readonly CoinSpec[] = [
  { key: "people", cx: 30, cy: 118, r: 33, rotate: -20, tone: "mint", glyph: "people", glyphStyle: "emboss", delay: 400 },
  { key: "check", cx: 352, cy: 118, r: 32, rotate: 18, tone: "lavender", glyph: "check", glyphStyle: "engrave", delay: 520 },
  { key: "ld", cx: 54, cy: 226, r: 40, rotate: -14, tone: "violet", glyph: "ld", glyphStyle: "emboss", delay: 460 },
  { key: "receipt", cx: 318, cy: 226, r: 35, rotate: 14, tone: "gold", glyph: "receipt", glyphStyle: "emboss", delay: 580 },
];

type PuffSpec = { key: string; box: Box; cx: number; cy: number; k: number; delay: number; detail: ClayDetail };
const PUFFS: readonly PuffSpec[] = [
  { key: "p1", box: [90, 297, 54, 44], cx: 116, cy: 318, k: 1, delay: 600, detail: "full" },
  { key: "p2", box: [61, 337, 27, 23], cx: 74, cy: 348, k: 0.5, delay: 680, detail: "low" },
];

const CHEVRONS = [
  { left: 118, opacity: 0.28 },
  { left: 132, opacity: 0.4 },
  { left: 146, opacity: 0.55 },
] as const;

const TRAIL_GRADIENT = ["rgba(118,87,246,0)", "rgba(118,87,246,0.35)", "rgba(181,165,255,0.55)"] as const;
const TRAIL_LOCATIONS = [0, 0.6, 1] as const;
const KNOB_GRADIENT = [violet.base, violet.deep] as const;

const SUBTITLE = "Track what you owe and what you’re owed, split group costs, and settle up with friends.";

// ---------------------------------------------------------------------------------------------------------
// Layout

function clamp(value: number, min: number, max: number): number {
  if (!(value > min)) return min;
  return value > max ? max : value;
}

/**
 * Fits the 390 × 380 artboard and the copy between the safe top and the pill. `s` scales the art (0.7–1.15);
 * below 0.75 the eyebrow is dropped to buy room. The copy keeps its type size; only the art scales.
 */
function splashLayout(width: number, height: number, insetTop: number, insetBottom: number): SplashLayout {
  const narrow = width < 350;
  const titleSize = narrow ? 26 : 30;
  const titleLine = narrow ? 32 : 37;
  const pillTop = height - (Math.max(insetBottom, 16) + 36) - PILL_H;
  const regionTop = insetTop + 12;
  const regionBottom = pillTop - 28;
  const room = regionBottom - regionTop;
  const fit = (textH: number) => clamp(Math.min(width / ART_W, (room - textH - GAP) / ART_H), 0.7, 1.15);
  const fullTextH = 24 + titleLine * 2 + 14 + 66;
  const fullScale = fit(fullTextH);
  const showEyebrow = fullScale >= 0.75;
  const textH = showEyebrow ? fullTextH : fullTextH - 24;
  const s = showEyebrow ? fullScale : fit(textH);
  const originY = regionTop + Math.max(0, room - (ART_H * s + GAP + textH)) * 0.35;
  return {
    s,
    originX: width / 2 - (ART_W / 2) * s,
    originY,
    titleSize,
    titleLine,
    showEyebrow,
    copyTop: originY + ART_H * s + GAP,
    pillTop,
    pillLeft: width / 2 - PILL_W / 2,
  };
}

// ---------------------------------------------------------------------------------------------------------
// Easing worklets. `phase` is the clamped 0–1 progress of one element on the shared clock.

function phase(clock: number, delay: number, duration: number): number {
  "worklet";
  const t = (clock - delay) / duration;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

function outCubic(x: number): number {
  "worklet";
  const u = 1 - x;
  return 1 - u * u * u;
}

/** Overshoots then settles: k 1.0 peaks near 1.037, k 1.3 near 1.062, k 1.5 near 1.08. */
function outBack(x: number, k: number): number {
  "worklet";
  const u = x - 1;
  return 1 + (k + 1) * u * u * u + k * u * u;
}

function inOutCubic(x: number): number {
  "worklet";
  if (x < 0.5) return 4 * x * x * x;
  const u = -2 * x + 2;
  return 1 - (u * u * u) / 2;
}

// ---------------------------------------------------------------------------------------------------------
// SVG helpers

function renderStops(list: readonly StopSpec[]) {
  return list.map(([offset, color, opacity = 1], index) => <Stop key={index} offset={offset} stopColor={color} stopOpacity={opacity} />);
}

const url = (id: string) => `url(#${id})`;

function Glints({ fill, glints }: { fill: string; glints: readonly GlintSpec[] }) {
  return (
    <>
      {glints.map((glint, index) => (
        <Ellipse
          key={index}
          cx={glint.cx}
          cy={glint.cy}
          rx={glint.rx}
          ry={glint.ry}
          transform={`rotate(${glint.rotate} ${glint.cx} ${glint.cy})`}
          fill={fill}
          opacity={glint.opacity}
        />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Scene layers. Each animated piece is its own absolutely positioned Animated.View sized to its artboard box
// times `s`, with an Svg whose viewBox is that box, so the geometry is written once in artboard units and
// transforms turn about the piece's own centre.

type SceneBoxProps = {
  box: Box;
  frame: Frame;
  animatedStyle: AnimatedStyle<ViewStyle>;
  hardware?: boolean;
  children: ReactNode;
};

function SceneBox({ box, frame, animatedStyle, hardware = false, children }: SceneBoxProps) {
  const [bx, by, bw, bh] = box;
  return createElement(
    Animated.View,
    {
      pointerEvents: "none",
      renderToHardwareTextureAndroid: hardware,
      style: [styles.layer, { left: frame.originX + bx * frame.s, top: frame.originY + by * frame.s, width: bw * frame.s, height: bh * frame.s }, animatedStyle],
    },
    children,
  );
}

function SceneLayer({ box, frame, animatedStyle, hardware, children }: SceneBoxProps) {
  const [bx, by, bw, bh] = box;
  return (
    <SceneBox box={box} frame={frame} animatedStyle={animatedStyle} hardware={hardware}>
      <Svg width={bw * frame.s} height={bh * frame.s} viewBox={`${bx} ${by} ${bw} ${bh}`}>
        {children}
      </Svg>
    </SceneBox>
  );
}

type PieceProps = { id: string; clock: Clock; frame: Frame };

const GLOW_BOX: Box = [-3, 0, 400, 340];

function GlowLayer({ id, clock, frame }: PieceProps) {
  const style = useAnimatedStyle(() => {
    const e = outCubic(phase(clock.value, 0, 520));
    return { opacity: e, transform: [{ scale: 0.7 + 0.3 * e }] };
  });
  return (
    <SceneLayer box={GLOW_BOX} frame={frame} animatedStyle={style} hardware>
      <Defs>
        <RadialGradient id={`${id}-glow`} cx={0.5} cy={0.5} r={0.5}>
          {renderStops([[0, violet.base, 0.4], [0.55, violet.deep, 0.16], [1, violet.deep, 0]])}
        </RadialGradient>
        <RadialGradient id={`${id}-contact`} cx={0.5} cy={0.5} r={0.5}>
          {renderStops([[0, NIGHT, 0.55], [1, NIGHT, 0]])}
        </RadialGradient>
      </Defs>
      <Ellipse cx={197} cy={170} rx={200} ry={170} fill={url(`${id}-glow`)} />
      <Ellipse cx={197} cy={312} rx={118} ry={14} fill={url(`${id}-contact`)} />
    </SceneLayer>
  );
}

function SideCloud({ id, clock, frame, spec }: PieceProps & { spec: SideCloudSpec }) {
  const { s } = frame;
  const { shift, delay, box } = spec;
  const style = useAnimatedStyle(() => {
    const e = outCubic(phase(clock.value, delay, 520));
    return { opacity: phase(clock.value, delay, 240), transform: [{ translateX: shift * (1 - e) * s }] };
  });
  return (
    <SceneLayer box={box} frame={frame} animatedStyle={style} hardware>
      <ClayParts.Cloud id={id} surface="dark" detail={spec.detail} tone="lavenderCloud" transform={cloudFitTransform(box[0], box[1], box[2])} />
    </SceneLayer>
  );
}

function Token({ id, clock, frame, spec }: PieceProps & { spec: TokenSpec }) {
  const { s } = frame;
  const { delay } = spec;
  const style = useAnimatedStyle(() => {
    const e = outBack(phase(clock.value, delay, 420), 1.6);
    return {
      opacity: phase(clock.value, delay, 160),
      transform: [{ translateY: -18 * (1 - e) * s }, { scale: 0.4 + 0.6 * e }, { rotate: `${120 * (1 - e)}deg` }],
    };
  });
  return (
    <SceneLayer box={[spec.cx - 18, spec.cy - 18, 36, 36]} frame={frame} animatedStyle={style}>
      <ClayParts.CoinFlat id={id} surface="dark" detail="low" cx={spec.cx} cy={spec.cy} rx={spec.rx} ry={spec.ry} thickness={4} rotate={spec.rotate} tone="gold" />
    </SceneLayer>
  );
}

function OrbitCoin({ id, clock, frame, spec }: PieceProps & { spec: CoinSpec }) {
  const { s } = frame;
  const { cx, cy, r, delay } = spec;
  const vx = cx - ORBIT_X;
  const vy = cy - ORBIT_Y;
  const style = useAnimatedStyle(() => {
    // The coin starts rotated 32° further round the scene centre and 28% further out, then sweeps in.
    const e = outBack(phase(clock.value, delay, 640), 1.5);
    const theta = ((32 * Math.PI) / 180) * (1 - e);
    const f = 1 + 0.28 * (1 - e);
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const px = ORBIT_X + (vx * cos - vy * sin) * f;
    const py = ORBIT_Y + (vx * sin + vy * cos) * f;
    return {
      opacity: phase(clock.value, delay, 200),
      transform: [{ translateX: (px - cx) * s }, { translateY: (py - cy) * s }, { scale: 0.45 + 0.55 * e }, { rotate: `${50 * (1 - e)}deg` }],
    };
  });
  return (
    <SceneLayer box={[cx - 1.5 * r, cy - 1.5 * r, 3 * r, 3 * r]} frame={frame} animatedStyle={style} hardware>
      <ClayParts.Coin
        id={id}
        surface="dark"
        detail={clayDetailFor("coin", 3 * r * s)}
        cx={cx}
        cy={cy}
        r={r}
        tone={spec.tone}
        glyph={spec.glyph}
        glyphStyle={spec.glyphStyle}
        rotate={spec.rotate}
        grounded={false}
      />
    </SceneLayer>
  );
}

function Puff({ id, clock, frame, spec }: PieceProps & { spec: PuffSpec }) {
  const { s } = frame;
  const { delay } = spec;
  const style = useAnimatedStyle(() => {
    const e = outCubic(phase(clock.value, delay, 480));
    return { opacity: e, transform: [{ translateY: 18 * (1 - e) * s }] };
  });
  return (
    <SceneLayer box={spec.box} frame={frame} animatedStyle={style} hardware>
      <ClayParts.Puff id={id} surface="dark" detail={spec.detail} cx={spec.cx} cy={spec.cy} k={spec.k} />
    </SceneLayer>
  );
}

function RiseBar({ id, clock, s, spec }: { id: string; clock: Clock; s: number; spec: BarSpec }) {
  const { x, top, rise, delay } = spec;
  const height = 256 - top;
  const style = useAnimatedStyle(() => {
    const e = outBack(phase(clock.value, delay, 480), 1.3);
    return { transform: [{ translateY: rise * (1 - e) * s }] };
  });
  return createElement(
    Animated.View,
    {
      style: [styles.layer, { left: (x - BAR_CLIP.x) * s, top: (top - BAR_CLIP.y) * s, width: 41 * s, height: height * s }, style],
    },
    <Svg width={41 * s} height={height * s} viewBox={`${x} ${top} 41 ${height}`}>
      <Defs>
        <SvgLinearGradient id={`${id}-body`} x1={0} y1={0} x2={1} y2={0}>
          {renderStops(BAR_TONES[spec.tone])}
        </SvgLinearGradient>
        <SvgLinearGradient id={`${id}-stripe`} x1={0} y1={0} x2={0} y2={1}>
          {renderStops([[0, WHITE, 0.75], [1, WHITE, 0]])}
        </SvgLinearGradient>
      </Defs>
      <Rect x={x + 7} y={top + 6} width={34} height={250 - top} rx={11} fill={violet.deep} opacity={0.2} />
      <Rect x={x} y={top} width={34} height={250 - top} rx={11} fill={url(`${id}-body`)} />
      <Rect x={x + 7} y={top + 10} width={5} height={spec.stripe} rx={2.5} fill={url(`${id}-stripe`)} />
      <Ellipse cx={x + 14} cy={top + 6} rx={8} ry={3} fill={WHITE} opacity={0.35} />
    </Svg>,
  );
}

/** Pale clay unifier and gradient defs shared by the back and front halves of the hero cloud. */
function CloudDefs({ id, silhouette }: { id: string; silhouette: string }) {
  return (
    <Defs>
      <RadialGradient id={`${id}-lobe`} cx={0.38} cy={0.3} r={0.75}>
        {renderStops(LOBE_STOPS)}
      </RadialGradient>
      <SvgLinearGradient id={`${id}-unify`} x1={0} y1={0.029} x2={0} y2={0.964}>
        {renderStops(UNIFIER_STOPS)}
      </SvgLinearGradient>
      <RadialGradient id={`${id}-spec`} cx={0.5} cy={0.5} r={0.5}>
        {renderStops(clayMaterial.specular)}
      </RadialGradient>
      <ClipPath id={`${id}-clip`}>
        <Path d={silhouette} clipRule="nonzero" />
      </ClipPath>
    </Defs>
  );
}

function CloudUnifier({ id }: { id: string }) {
  return (
    <G clipPath={url(`${id}-clip`)} clipRule="nonzero">
      <Rect x={CLOUD_BOX[0]} y={CLOUD_BOX[1]} width={CLOUD_BOX[2]} height={CLOUD_BOX[3]} fill={url(`${id}-unify`)} />
    </G>
  );
}

function Lobes({ id, lobes }: { id: string; lobes: readonly Lobe[] }) {
  return (
    <>
      {lobes.map((lobe, index) => (
        <Circle key={index} cx={lobe.cx} cy={lobe.cy} r={lobe.r} fill={url(`${id}-lobe`)} />
      ))}
    </>
  );
}

function CloudGroup({ id, clock, frame }: PieceProps) {
  const { s } = frame;
  const [, , bw, bh] = CLOUD_BOX;
  const viewBox = CLOUD_BOX.join(" ");
  const backId = `${id}-back`;
  const frontId = `${id}-front`;
  const style = useAnimatedStyle(() => {
    const e = outBack(phase(clock.value, 40, 600), 1.0);
    return { opacity: phase(clock.value, 40, 220), transform: [{ translateY: 28 * (1 - e) * s }, { scale: 0.84 + 0.16 * e }] };
  });
  return (
    <SceneBox box={CLOUD_BOX} frame={frame} animatedStyle={style}>
      <View style={StyleSheet.absoluteFill} renderToHardwareTextureAndroid>
        <Svg width={bw * s} height={bh * s} viewBox={viewBox}>
          <CloudDefs id={backId} silhouette={BACK_SILHOUETTE} />
          <Lobes id={backId} lobes={BACK_TOP_LOBES} />
          <Ellipse cx={BACK_FILLER.cx} cy={BACK_FILLER.cy} rx={BACK_FILLER.rx} ry={BACK_FILLER.ry} fill={cloud.shade} />
          <Lobes id={backId} lobes={BACK_LOW_LOBES} />
          <CloudUnifier id={backId} />
          <Glints fill={url(`${backId}-spec`)} glints={BACK_GLINTS} />
        </Svg>
      </View>
      <View
        collapsable={false}
        style={[
          styles.barClip,
          { left: (BAR_CLIP.x - CLOUD_BOX[0]) * s, top: (BAR_CLIP.y - CLOUD_BOX[1]) * s, width: BAR_CLIP.width * s, height: BAR_CLIP.height * s },
        ]}
      >
        {BARS.map((bar) => (
          <RiseBar key={bar.key} id={`${id}-bar-${bar.key}`} clock={clock} s={s} spec={bar} />
        ))}
      </View>
      <View style={StyleSheet.absoluteFill} renderToHardwareTextureAndroid>
        <Svg width={bw * s} height={bh * s} viewBox={viewBox}>
          <CloudDefs id={frontId} silhouette={FRONT_SILHOUETTE} />
          <Lobes id={frontId} lobes={FRONT_LOBES} />
          <CloudUnifier id={frontId} />
          <Glints fill={url(`${frontId}-spec`)} glints={FRONT_GLINTS} />
        </Svg>
      </View>
    </SceneBox>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Copy and progress pill

function CopyLine({ clock, delay, duration, rise, s, style, children }: { clock: Clock; delay: number; duration: number; rise: number; s: number; style?: ViewStyle; children: ReactNode }) {
  const animatedStyle = useAnimatedStyle(() => {
    const e = outCubic(phase(clock.value, delay, duration));
    return { opacity: e, transform: [{ translateY: rise * (1 - e) * s }] };
  });
  return createElement(Animated.View, { style: [styles.copyLine, style, animatedStyle] }, children);
}

function ProgressPill({ clock, left, top }: { clock: Clock; left: number; top: number }) {
  const trackStyle = useAnimatedStyle(() => {
    const e = outCubic(phase(clock.value, 480, 320));
    return { opacity: e, transform: [{ scale: 0.94 + 0.06 * e }] };
  });
  const trailStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: KNOB_TRAVEL * inOutCubic(phase(clock.value, 600, 740)) - KNOB_TRAVEL }],
  }));
  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: KNOB_TRAVEL * inOutCubic(phase(clock.value, 600, 740)) }],
  }));
  const arrowStyle = useAnimatedStyle(() => {
    const e = outCubic(phase(clock.value, 1240, 140));
    return { opacity: 1 - e, transform: [{ translateX: 6 * e }] };
  });
  const checkStyle = useAnimatedStyle(() => {
    const p = phase(clock.value, 1270, 170);
    return { opacity: outCubic(p), transform: [{ scale: 0.6 + 0.4 * outBack(p, 1.6) }] };
  });

  return createElement(
    Animated.View,
    { style: [styles.track, { left, top }, trackStyle] },
    CHEVRONS.map((chevron) => (
      <View key={chevron.left} style={[styles.chevron, { left: chevron.left, opacity: chevron.opacity }]}>
        <Icon name="chevron-right" size={14} color={WHITE} />
      </View>
    )),
    createElement(
      Animated.View,
      { style: [styles.trail, trailStyle] },
      <LinearGradient colors={TRAIL_GRADIENT} locations={TRAIL_LOCATIONS} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.trailFill} />,
    ),
    createElement(
      Animated.View,
      { style: [styles.knob, knobStyle] },
      <LinearGradient colors={KNOB_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.knobFill} />,
      createElement(Animated.View, { style: [styles.knobCenter, arrowStyle] }, <Icon name="arrow-right" size={20} color={WHITE} />),
      createElement(Animated.View, { style: [styles.checkDisc, checkStyle] }, <Icon name="check" size={20} color={colors.ink} />),
    ),
  );
}

// ---------------------------------------------------------------------------------------------------------

export function SplashTransition({ onFinish }: SplashTransitionProps) {
  // Read once at mount. Under reduced motion the clock starts at its end, so the first frame is the final pose.
  const reduceMotion = useReducedMotion();
  const clock = useSharedValue(reduceMotion ? INTRO_MS : 0);
  const exit = useSharedValue(0);
  const finished = useRef(false);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reactId = useId();
  const id = useMemo(() => clayIdPrefix(reactId, "splash"), [reactId]);
  const layout = useMemo(() => splashLayout(width, height, insets.top, insets.bottom), [width, height, insets.top, insets.bottom]);
  const frame = useMemo<Frame>(() => ({ s: layout.s, originX: layout.originX, originY: layout.originY }), [layout.s, layout.originX, layout.originY]);
  const { s } = frame;

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: 1 - exit.value,
    transform: [{ scale: reduceMotion ? 1 : 1 + exit.value * 0.025 }],
  }));
  const backgroundStyle = useAnimatedStyle(() => ({ opacity: outCubic(phase(clock.value, 0, 360)) }));

  useEffect(() => {
    const finish = () => {
      if (finished.current) return;
      finished.current = true;
      onFinish();
    };
    if (!reduceMotion) clock.value = withTiming(INTRO_MS, { duration: INTRO_MS, easing: Easing.linear });
    exit.value = reduceMotion
      ? withDelay(450, withTiming(1, { duration: 200 }, (done) => {
        if (done) scheduleOnRN(finish);
      }))
      : withDelay(motion.splash - EXIT_MS, withTiming(1, { duration: EXIT_MS, easing: Easing.inOut(Easing.cubic) }, (done) => {
        if (done) scheduleOnRN(finish);
      }));
    // Safety net: if the UI-thread callback never lands (backgrounded launch, dropped frames), still hand over.
    const fallback = setTimeout(finish, motion.splash + 800);
    return () => {
      clearTimeout(fallback);
      cancelAnimation(clock);
      cancelAnimation(exit);
    };
  }, [clock, exit, onFinish, reduceMotion]);

  const titleText = { fontSize: layout.titleSize, lineHeight: layout.titleLine };

  return createElement(
    Animated.View,
    {
      pointerEvents: "none",
      accessibilityElementsHidden: true,
      importantForAccessibility: "no-hide-descendants",
      "aria-hidden": true,
      style: [styles.overlay, overlayStyle],
    },
    <StatusBar style="light" />,
    <View style={styles.base} />,
    createElement(
      Animated.View,
      { style: [StyleSheet.absoluteFill, backgroundStyle] },
      <LinearGradient colors={BG_GRADIENT} locations={BG_LOCATIONS} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />,
    ),
    <GlowLayer id={`${id}-glow`} clock={clock} frame={frame} />,
    SIDE_CLOUDS.map((spec) => <SideCloud key={spec.key} id={`${id}-${spec.key}`} clock={clock} frame={frame} spec={spec} />),
    BACK_TOKENS.map((spec) => <Token key={spec.key} id={`${id}-${spec.key}`} clock={clock} frame={frame} spec={spec} />),
    <CloudGroup id={`${id}-cloud`} clock={clock} frame={frame} />,
    FRONT_TOKENS.map((spec) => <Token key={spec.key} id={`${id}-${spec.key}`} clock={clock} frame={frame} spec={spec} />),
    COINS.map((spec) => <OrbitCoin key={spec.key} id={`${id}-coin-${spec.key}`} clock={clock} frame={frame} spec={spec} />),
    PUFFS.map((spec) => <Puff key={spec.key} id={`${id}-${spec.key}`} clock={clock} frame={frame} spec={spec} />),
    <View style={[styles.copy, { top: layout.copyTop }]}>
      {layout.showEyebrow ? (
        <CopyLine clock={clock} delay={520} duration={420} rise={10} s={s} style={styles.eyebrowLine}>
          {createElement(NativeText, { allowFontScaling: false, style: styles.eyebrow }, "LENADENA")}
        </CopyLine>
      ) : null}
      <CopyLine clock={clock} delay={580} duration={460} rise={16} s={s}>
        {createElement(NativeText, { allowFontScaling: false, numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.8, style: [styles.title, titleText] }, "Shared money,")}
      </CopyLine>
      <CopyLine clock={clock} delay={640} duration={460} rise={16} s={s}>
        {createElement(NativeText, { allowFontScaling: false, numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.8, style: [styles.title, styles.titleAccent, titleText] }, "minus the awkward.")}
      </CopyLine>
      <CopyLine clock={clock} delay={720} duration={440} rise={12} s={s} style={styles.subtitleLine}>
        {createElement(NativeText, { allowFontScaling: false, style: styles.subtitle }, SUBTITLE)}
      </CopyLine>
    </View>,
    <ProgressPill clock={clock} left={layout.pillLeft} top={layout.pillTop} />,
  );
}

const FILL = { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 } as const;

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    // Above the app lock (45) so launch reads splash -> lock; below toasts.
    zIndex: 50,
    elevation: 50,
    overflow: "hidden",
  },
  base: {
    ...FILL,
    backgroundColor: BG_BASE,
  },
  layer: {
    position: "absolute",
  },
  barClip: {
    position: "absolute",
    overflow: "hidden",
  },
  copy: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  copyLine: {
    alignSelf: "stretch",
    alignItems: "center",
  },
  eyebrowLine: {
    marginBottom: 10,
  },
  eyebrow: {
    color: LAVENDER_TEXT,
    fontFamily: "Manrope_700Bold",
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 2.2,
    textAlign: "center",
  },
  title: {
    color: WHITE,
    fontFamily: "Manrope_800ExtraBold",
    letterSpacing: -0.6,
    textAlign: "center",
  },
  titleAccent: {
    color: LAVENDER_TEXT,
  },
  subtitleLine: {
    marginTop: 14,
  },
  subtitle: {
    maxWidth: 272,
    color: "rgba(246,242,255,0.72)",
    fontFamily: "Manrope_500Medium",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  track: {
    position: "absolute",
    width: PILL_W,
    height: PILL_H,
    overflow: "hidden",
    borderRadius: PILL_H / 2,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  chevron: {
    position: "absolute",
    top: 17,
    width: 14,
    height: 14,
  },
  trail: {
    position: "absolute",
    left: 0,
    top: 0,
    width: PILL_W,
    height: 50,
    overflow: "hidden",
    borderRadius: 26,
  },
  trailFill: {
    ...FILL,
    borderRadius: 26,
  },
  knob: {
    position: "absolute",
    left: 6,
    top: 5,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: violet.deep,
    shadowColor: violet.base,
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  knobFill: {
    ...FILL,
    borderRadius: 20,
  },
  knobCenter: {
    ...FILL,
    alignItems: "center",
    justifyContent: "center",
  },
  checkDisc: {
    ...FILL,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: colors.lime,
  },
});
