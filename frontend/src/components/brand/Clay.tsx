import { memo, useId, useMemo, type ReactElement, type ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { View } from "react-native";
import Svg, { Circle, ClipPath, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import {
  CLAY_CALENDAR_HEADER,
  CLAY_RECEIPT_PAPER,
  clayCloudBase,
  clayCloudBounds,
  clayCloudLobes,
  clayDetailFor,
  clayGlyphs,
  clayHeightFor,
  clayIdPrefix,
  clayMaterial,
  clayMinSize,
  clayPaths,
  clayPeopleFigures,
  clayRamps,
  clayStackDiscs,
  clayViewBox,
  arcPath,
  contactStops,
  glyphTransform,
  r2,
  sideBand,
  sweptCircle,
  type ClayDetail,
  type ClayGlyph,
  type ClayName,
  type ClayRamp,
  type ClaySurface,
} from "./clay-kit";

// Glossy clay illustrations drawn only with react-native-svg primitives.
// Light comes from the upper left. Layer order: glow, ground AO, parts behind, extrusion, bounce, body,
// bevel lip, details and glyph, soft specular, hot specular. Gradients use objectBoundingBox units and no
// focal points. Every SVG id comes from `useId` through `clayIdPrefix`, so any number of pieces can coexist.

// ---------------------------------------------------------------------------------------------------------
// Types

export type ClayCoinTone = "gold" | "violet" | "lavender" | "mint" | "coral";
export type ClayBadgeTone = "mint" | "violet" | "gold" | "coral";
export type ClayGlyphStyle = "emboss" | "engrave";
export type ClayEmptySubject = "activity" | "groups" | "expenses" | "reviews";

export type ClayCommonProps = {
  /** Width in points (an integer). Height is `round(size · vb.h / vb.w)`. */
  size: number;
  /** What sits directly behind the art. Default "light". */
  surface?: ClaySurface;
  /** Lavender halo behind the piece. Default `surface === "dark"`. */
  glow?: boolean;
  /** Ground shadow under the piece. Default true. */
  grounded?: boolean;
  /** Omit for decorative art (hidden from screen readers). When set, the art is announced as an image. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export type ClayPartBase = { id: string; surface: ClaySurface; detail: ClayDetail };
type PieceOptions = { transform?: string; glow?: boolean; grounded?: boolean };

export type ClayCoinPartProps = ClayPartBase & {
  cx: number;
  cy: number;
  r: number;
  /** Extrusion vector. Default (.2r, .175r). */
  depth?: [number, number];
  tone: ClayCoinTone;
  glyph?: ClayGlyph | "none";
  glyphStyle?: ClayGlyphStyle;
  /** Degrees. Turns the glyph on the face; the rim, extrusion and highlights keep the upper-left light. */
  rotate?: number;
  glow?: boolean;
  grounded?: boolean;
};
export type ClayCoinFlatPartProps = ClayPartBase & { cx: number; cy: number; rx: number; ry: number; thickness: number; rotate?: number; tone: ClayCoinTone };
export type ClayBadgePartProps = ClayPartBase & { cx: number; cy: number; r: number; tone: ClayBadgeTone; glyph: ClayGlyph };
export type ClayCloudPartProps = ClayPartBase & { transform?: string; tone: "cloud" | "lavenderCloud"; mirror?: boolean };
export type ClayPuffPartProps = ClayPartBase & { cx: number; cy: number; k: number };
export type ClayCoinStackPartProps = ClayPartBase & PieceOptions;
export type ClayWalletPartProps = ClayPartBase & PieceOptions;
export type ClayReceiptPartProps = ClayPartBase & PieceOptions & { stamp?: "check" | "plus" | "none" };
export type ClayPeoplePartProps = ClayPartBase & PieceOptions & { accessory?: "plus" | "check" | "none" };
export type ClayCalendarPartProps = ClayPartBase & PieceOptions & { accent?: "mint" | "violet" };
export type ClayTrayPartProps = ClayPartBase & PieceOptions;

// ---------------------------------------------------------------------------------------------------------
// SVG helpers. Stops must be direct children of a gradient (react-native-svg reads their props), so these
// return elements instead of being components.

type StopList = readonly (readonly [offset: number, color: string, opacity?: number])[];

function renderStops(list: StopList): ReactElement[] {
  return list.map(([offset, color, opacity = 1], index) => <Stop key={index} offset={offset} stopColor={color} stopOpacity={opacity} />);
}

function radial(id: string, list: StopList, cx = 0.5, cy = 0.5, r = 0.5) {
  return (
    <RadialGradient key={id} id={id} cx={cx} cy={cy} r={r}>
      {renderStops(list)}
    </RadialGradient>
  );
}

function linear(id: string, list: StopList, x1 = 0, y1 = 0, x2 = 1, y2 = 1) {
  return (
    <LinearGradient key={id} id={id} x1={x1} y1={y1} x2={x2} y2={y2}>
      {renderStops(list)}
    </LinearGradient>
  );
}

const url = (id: string) => `url(#${id})`;
const rotateAbout = (degrees: number, x: number, y: number) => `rotate(${r2(degrees)} ${r2(x)} ${r2(y)})`;

const WHITE = "#FFFFFF";
const NIGHT = "#0D0720";

/** Soft specular: a radial white fade. Hot specular: a solid white ellipse. Both rotated about their centre. */
function Specular({ fill, cx, cy, rx, ry, rotate, opacity = 1 }: { fill: string; cx: number; cy: number; rx: number; ry: number; rotate: number; opacity?: number }) {
  return <Ellipse cx={r2(cx)} cy={r2(cy)} rx={r2(rx)} ry={r2(ry)} transform={rotateAbout(rotate, cx, cy)} fill={fill} opacity={opacity} />;
}

type EllipseBox = { cx: number; cy: number; rx: number; ry: number };

/** Optional lavender (or mint) glow on dark surfaces and the ground AO ellipse. */
function Halo({ id, surface, glow, grounded, glowBox, aoBox, glowTone = "lavender" }: { id: string; surface: ClaySurface; glow: boolean; grounded: boolean; glowBox: EllipseBox; aoBox: EllipseBox; glowTone?: "lavender" | "mint" }) {
  if (!glow && !grounded) return null;
  return (
    <>
      <Defs>
        {glow ? radial(`${id}-glow`, glowTone === "mint" ? clayMaterial.glowMint : clayMaterial.glow) : null}
        {grounded ? radial(`${id}-ao`, surface === "dark" ? clayMaterial.aoDark : clayMaterial.aoLight) : null}
      </Defs>
      {glow ? <Ellipse cx={glowBox.cx} cy={glowBox.cy} rx={glowBox.rx} ry={glowBox.ry} fill={url(`${id}-glow`)} /> : null}
      {grounded ? <Ellipse cx={aoBox.cx} cy={aoBox.cy} rx={aoBox.rx} ry={aoBox.ry} fill={url(`${id}-ao`)} /> : null}
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Glyphs

type GlyphFinish = "emboss" | "engrave" | "badge";

function glyphLayers(glyph: ClayGlyph, color: string, accentColor: string, withAccent: boolean, strokeOverride?: number) {
  const spec = clayGlyphs[glyph];
  return spec.layers.map((layer, index) => {
    if (layer.accent && !withAccent) return null;
    const paint = layer.accent ? accentColor : color;
    if (layer.mode === "stroke") {
      return (
        <Path
          key={index}
          d={layer.d}
          fill="none"
          stroke={paint}
          strokeWidth={layer.strokeWidth ?? strokeOverride ?? spec.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={layer.opacity ?? 1}
        />
      );
    }
    return layer.strokeWidth ? (
      <Path key={index} d={layer.d} fill={paint} stroke={paint} strokeWidth={layer.strokeWidth} strokeLinejoin="round" opacity={layer.opacity ?? 1} />
    ) : (
      <Path key={index} d={layer.d} fill={paint} opacity={layer.opacity ?? 1} />
    );
  });
}

/**
 * emboss: a depth pass in `edge` offset down-right, then the face in `hi`.
 * engrave: a white pass offset down-right, then the glyph in `edge`.
 * badge: a straight-down depth pass in `edge`, then a white face.
 * Low detail skips the offset pass.
 */
function GlyphMark({ glyph, cx, cy, box, ramp, finish, detail }: { glyph: ClayGlyph; cx: number; cy: number; box: number; ramp: ClayRamp; finish: GlyphFinish; detail: ClayDetail }) {
  const spec = clayGlyphs[glyph];
  const strokeOverride = finish === "badge" && spec.box[2] === 24 ? 3.4 : undefined;
  const pass =
    finish === "emboss"
      ? { dx: 0.06 * box, dy: 0.07 * box, color: ramp.edge, opacity: 0.9, face: ramp.hi, accent: ramp.deep }
      : finish === "engrave"
        ? { dx: 0.04 * box, dy: 0.05 * box, color: WHITE, opacity: 0.6, face: ramp.edge, accent: ramp.hi }
        : { dx: 0, dy: 0.06 * box, color: ramp.edge, opacity: 0.55, face: WHITE, accent: ramp.deep };
  const { dot } = spec;
  return (
    <>
      {detail === "full" ? (
        <G opacity={pass.opacity} transform={glyphTransform(glyph, cx + pass.dx, cy + pass.dy, box)}>
          {glyphLayers(glyph, pass.color, pass.color, false, strokeOverride)}
        </G>
      ) : null}
      <G transform={glyphTransform(glyph, cx, cy, box)}>
        {glyphLayers(glyph, pass.face, pass.accent, true, strokeOverride)}
        {dot ? <Circle cx={dot.cx} cy={dot.cy} r={dot.r} fill={dot.color} /> : null}
      </G>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Parts. Each places its own Defs first and draws in viewBox units, so several parts can share one Svg root.

function CoinPart({ id, surface, detail, cx, cy, r, depth, tone, glyph = "none", glyphStyle = "emboss", rotate = 0, glow = surface === "dark", grounded = true }: ClayCoinPartProps) {
  const ramp = clayRamps[tone];
  const dx = depth ? depth[0] : 0.2 * r;
  const dy = depth ? depth[1] : 0.175 * r;
  const k = r / 40;
  const full = detail === "full";
  const slotR = r2(0.74 * r);
  const edgePath = useMemo(() => sweptCircle(cx, cy, r, dx, dy), [cx, cy, r, dx, dy]);
  const bouncePath = useMemo(() => arcPath(cx + dx * 0.55, cy + dy * 0.55, r, 10, 80), [cx, cy, r, dx, dy]);
  return (
    <>
      <Defs>
        {linear(`${id}-edge`, [[0, ramp.shade], [0.55, ramp.deep], [1, ramp.edge]])}
        {radial(`${id}-face`, [[0, ramp.hi], [0.22, ramp.light], [0.62, ramp.base], [1, ramp.shade]], 0.36, 0.32, 0.8)}
        {full ? linear(`${id}-lip`, [[0, ramp.hi, 0.95], [0.5, ramp.hi, 0], [1, ramp.edge, 0.4]]) : null}
        {linear(`${id}-slot`, [[0, ramp.shade], [0.6, ramp.base], [1, ramp.light]], 0.2, 0.1, 0.8, 0.95)}
        {full ? linear(`${id}-slotlip`, [[0, ramp.edge, 0.5], [0.5, ramp.edge, 0], [1, ramp.hi, 0.85]], 0.2, 0.1, 0.8, 0.95) : null}
        {radial(`${id}-spec`, clayMaterial.specular)}
      </Defs>
      <Halo
        id={id}
        surface={surface}
        glow={glow}
        grounded={grounded}
        glowBox={{ cx: r2(cx + 0.15 * r), cy: r2(cy + 0.1 * r), rx: r2(1.3 * r), ry: r2(1.2 * r) }}
        aoBox={{ cx: r2(cx + 0.2 * r), cy: r2(cy + 1.4 * r), rx: r2(0.9 * r), ry: r2(0.1625 * r) }}
      />
      <Path d={edgePath} fill={url(`${id}-edge`)} />
      {full ? <Path d={bouncePath} fill="none" stroke={ramp.light} strokeOpacity={0.45} strokeWidth={r2(2.5 * k)} strokeLinecap="round" /> : null}
      <Circle cx={cx} cy={cy} r={r} fill={url(`${id}-face`)} />
      {full ? <Circle cx={cx} cy={cy} r={r2(r - 1.5 * k)} fill="none" stroke={url(`${id}-lip`)} strokeWidth={r2(3 * k)} /> : null}
      <Circle cx={cx} cy={cy} r={slotR} fill={url(`${id}-slot`)} />
      {full ? <Circle cx={cx} cy={cy} r={slotR} fill="none" stroke={url(`${id}-slotlip`)} strokeWidth={r2(2 * k)} /> : null}
      {glyph !== "none" ? (
        <G transform={rotate ? rotateAbout(rotate, cx, cy) : undefined}>
          <GlyphMark glyph={glyph} cx={cx} cy={cy} box={slotR} ramp={ramp} finish={glyphStyle} detail={detail} />
        </G>
      ) : null}
      <Specular fill={url(`${id}-spec`)} cx={cx - 0.35 * r} cy={cy - 0.45 * r} rx={0.45 * r} ry={0.24 * r} rotate={-35} />
      <Specular fill={WHITE} opacity={0.9} cx={cx - 0.45 * r} cy={cy - 0.55 * r} rx={0.12 * r} ry={0.065 * r} rotate={-35} />
    </>
  );
}

function CoinFlatPart({ id, detail, cx, cy, rx, ry, thickness, rotate = -14, tone }: ClayCoinFlatPartProps) {
  const ramp = clayRamps[tone];
  const band = useMemo(() => sideBand(cx, cy, rx, ry, thickness), [cx, cy, rx, ry, thickness]);
  return (
    <>
      <Defs>
        {linear(`${id}-band`, [[0, ramp.shade], [0.3, ramp.light], [0.5, ramp.base], [0.85, ramp.deep], [1, ramp.edge]], 0, 0, 1, 0)}
        {radial(`${id}-top`, [[0, ramp.light], [0.6, ramp.base], [1, ramp.shade]], 0.4, 0.35, 0.8)}
        {radial(`${id}-spec`, clayMaterial.specular)}
      </Defs>
      <G transform={rotateAbout(rotate, cx, cy)}>
        <Path d={band} fill={url(`${id}-band`)} />
        <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={url(`${id}-top`)} />
        {detail === "full" ? (
          <Ellipse cx={cx} cy={cy} rx={r2(0.72 * rx)} ry={r2(0.72 * ry)} fill="none" stroke={ramp.hi} strokeOpacity={0.55} strokeWidth={r2((2 * rx) / 44)} />
        ) : null}
        <Ellipse cx={r2(cx - 0.35 * rx)} cy={r2(cy - 0.3 * ry)} rx={r2(0.3 * rx)} ry={r2(0.28 * ry)} fill={url(`${id}-spec`)} />
      </G>
    </>
  );
}

function BadgePart({ id, detail, cx, cy, r, tone, glyph }: ClayBadgePartProps) {
  const ramp = clayRamps[tone];
  const k = r / 40;
  const edgePath = useMemo(() => sweptCircle(cx, cy, r, 0, 0.225 * r), [cx, cy, r]);
  const full = detail === "full";
  return (
    <>
      <Defs>
        {linear(`${id}-edge`, [[0, ramp.shade], [0.5, ramp.deep], [1, ramp.edge]], 0, 0, 0, 1)}
        {radial(`${id}-face`, [[0, ramp.hi], [0.3, ramp.light], [0.7, ramp.base], [1, ramp.shade]], 0.38, 0.3, 0.78)}
        {full ? linear(`${id}-lip`, [[0, WHITE, 0.8], [0.5, WHITE, 0], [1, ramp.edge, 0.3]]) : null}
        {radial(`${id}-spec`, clayMaterial.specular)}
      </Defs>
      <Path d={edgePath} fill={url(`${id}-edge`)} />
      <Circle cx={cx} cy={cy} r={r} fill={url(`${id}-face`)} />
      {full ? <Circle cx={cx} cy={cy} r={r2(r - 1.5 * k)} fill="none" stroke={url(`${id}-lip`)} strokeWidth={r2(3 * k)} /> : null}
      <GlyphMark glyph={glyph} cx={cx} cy={cy} box={r} ramp={ramp} finish="badge" detail={detail} />
      <Specular fill={url(`${id}-spec`)} cx={cx - 0.4 * r} cy={cy - 0.5 * r} rx={0.45 * r} ry={0.22 * r} rotate={-30} />
      <Specular fill={WHITE} opacity={0.95} cx={cx - 0.5 * r} cy={cy - 0.58 * r} rx={0.12 * r} ry={0.062 * r} rotate={-30} />
    </>
  );
}

function CloudPart({ id, surface, detail, transform, tone, mirror = false }: ClayCloudPartProps) {
  const ramp = clayRamps[tone];
  const dark = surface === "dark";
  const { x: bx, y: by, width: bw, height: bh } = clayCloudBounds;
  const base = clayCloudBase;
  const clip = url(`${id}-clip`);
  return (
    <>
      <Defs>
        <ClipPath id={`${id}-clip`}>
          <Path d={clayPaths.cloudSilhouette} clipRule="nonzero" />
        </ClipPath>
        {radial(`${id}-body`, [[0, ramp.hi], [0.3, ramp.light], [0.58, ramp.base], [0.82, ramp.shade], [1, ramp.deep]], 0.4, 0.19, 0.8)}
        {radial(`${id}-crease`, [[0, ramp.shade, 0], [0.55, ramp.shade, 0], [0.78, ramp.shade, dark ? 0.3 : 0.45], [1, ramp.edge, dark ? 0.45 : 0.6]], 0.36, 0.3, 0.72)}
        {linear(`${id}-under`, [[0, ramp.edge, 0], [1, ramp.edge, 0.32]], 0, 0, 0, 1)}
        {radial(`${id}-spec`, clayMaterial.specular)}
      </Defs>
      <G transform={transform}>
        <G transform={mirror ? "translate(200 0) scale(-1 1)" : undefined}>
          {dark ? null : (
            <G opacity={0.8}>
              {clayCloudLobes.map((lobe, index) => <Circle key={index} cx={lobe.cx} cy={lobe.cy} r={lobe.r} fill="none" stroke={ramp.deep} strokeWidth={2} />)}
              <Rect x={base.x} y={base.y} width={base.width} height={base.height} rx={base.rx} fill="none" stroke={ramp.deep} strokeWidth={2} />
            </G>
          )}
          <G clipPath={clip} clipRule="nonzero">
            <Rect x={bx} y={by} width={bw} height={bh} fill={url(`${id}-body`)} />
          </G>
          {clayCloudLobes.map((lobe, index) => <Circle key={index} cx={lobe.cx} cy={lobe.cy} r={lobe.r} fill={url(`${id}-crease`)} />)}
          <G clipPath={clip} clipRule="nonzero">
            <Rect x={bx} y={92} width={bw} height={26} fill={url(`${id}-under`)} />
          </G>
        </G>
        <Specular fill={url(`${id}-spec`)} cx={84} cy={34} rx={26} ry={12} rotate={-12} />
        <Specular fill={WHITE} opacity={0.95} cx={78} cy={29} rx={9} ry={4} rotate={-12} />
        {detail === "full" ? <Specular fill={url(`${id}-spec`)} cx={46} cy={66} rx={9} ry={4.5} rotate={-24} /> : null}
      </G>
    </>
  );
}

function PuffPart({ id, cx, cy, k }: ClayPuffPartProps) {
  const ramp = clayRamps.cloud;
  const balls = [
    { x: cx - 10 * k, y: cy + 7 * k, r: 16 * k },
    { x: cx + 6 * k, y: cy - k, r: 20 * k },
    { x: cx + 16 * k, y: cy + 11 * k, r: 12 * k },
  ];
  return (
    <>
      <Defs>
        {radial(`${id}-fill`, [[0, ramp.hi], [0.5, ramp.base], [1, ramp.shade]], 0.4, 0.3, 0.8)}
        {radial(`${id}-spec`, clayMaterial.specular)}
      </Defs>
      {balls.map((ball, index) => <Circle key={index} cx={r2(ball.x)} cy={r2(ball.y)} r={r2(ball.r)} fill={url(`${id}-fill`)} />)}
      <Ellipse cx={r2(cx)} cy={r2(cy - 11 * k)} rx={r2(7 * k)} ry={r2(3.5 * k)} fill={url(`${id}-spec`)} />
    </>
  );
}

function CoinStackPart({ id, surface, detail, transform, glow = surface === "dark", grounded = true }: ClayCoinStackPartProps) {
  const gold = clayRamps.gold;
  const full = detail === "full";
  const top = clayStackDiscs[3];
  return (
    <G transform={transform}>
      <Defs>
        {linear(`${id}-band`, [[0, gold.shade], [0.28, gold.light], [0.45, gold.base], [0.8, gold.deep], [1, gold.edge]], 0, 0, 1, 0)}
        {radial(`${id}-disc`, [[0, gold.light], [0.6, gold.base], [1, gold.shade]], 0.4, 0.35, 0.8)}
        {radial(`${id}-contact`, contactStops(gold.edge))}
        {linear(`${id}-edge`, [[0, gold.shade], [0.55, gold.deep], [1, gold.edge]])}
        {radial(`${id}-face`, [[0, gold.hi], [0.22, gold.light], [0.62, gold.base], [1, gold.shade]], 0.36, 0.32, 0.8)}
        {full ? linear(`${id}-lip`, [[0, gold.hi, 0.95], [0.5, gold.hi, 0], [1, gold.edge, 0.4]]) : null}
        {linear(`${id}-slot`, [[0, gold.shade], [0.6, gold.base], [1, gold.light]], 0.2, 0.1, 0.8, 0.95)}
        {full ? linear(`${id}-slotlip`, [[0, gold.edge, 0.5], [0.5, gold.edge, 0], [1, gold.hi, 0.85]], 0.2, 0.1, 0.8, 0.95) : null}
        {radial(`${id}-spec`, clayMaterial.specular)}
      </Defs>
      <Halo id={id} surface={surface} glow={glow} grounded={grounded} glowBox={{ cx: 66, cy: 150, rx: 66, ry: 90 }} aoBox={{ cx: 68, cy: 226, rx: 58, ry: 8 }} />
      {clayStackDiscs.map((disc, index) => (
        <G key={index}>
          {index > 0 ? <Ellipse cx={disc.cx} cy={disc.cy + 18} rx={53} ry={15} fill={url(`${id}-contact`)} /> : null}
          <Path d={clayPaths.stackBands[index]} fill={url(`${id}-band`)} />
          {full ? <Path d={clayPaths.stackGrooves[index]} fill="none" stroke={gold.edge} strokeOpacity={0.22} strokeWidth={1} /> : null}
          <Ellipse cx={disc.cx} cy={disc.cy} rx={52} ry={13} fill={url(`${id}-disc`)} />
          {full ? <Path d={clayPaths.stackRims[index]} fill="none" stroke={gold.hi} strokeOpacity={0.5} strokeWidth={1.5} strokeLinecap="round" /> : null}
        </G>
      ))}
      <Ellipse cx={top.cx} cy={top.cy} rx={37} ry={9.4} fill="none" stroke={gold.hi} strokeOpacity={0.55} strokeWidth={2} />
      <Ellipse cx={68} cy={138} rx={36} ry={8} fill={url(`${id}-contact`)} />
      <G transform="rotate(-10 66 82)">
        <Ellipse cx={74} cy={85} rx={48} ry={52} fill={url(`${id}-edge`)} />
        <Ellipse cx={66} cy={82} rx={48} ry={52} fill={url(`${id}-face`)} />
        {full ? <Ellipse cx={66} cy={82} rx={46.5} ry={50.5} fill="none" stroke={url(`${id}-lip`)} strokeWidth={3} /> : null}
        <Ellipse cx={66} cy={82} rx={35.5} ry={38.5} fill={url(`${id}-slot`)} />
        {full ? <Ellipse cx={66} cy={82} rx={35.5} ry={38.5} fill="none" stroke={url(`${id}-slotlip`)} strokeWidth={2} /> : null}
        <GlyphMark glyph="exchange" cx={66} cy={82} box={36} ramp={gold} finish="emboss" detail={detail} />
        <Specular fill={url(`${id}-spec`)} cx={48} cy={52} rx={16} ry={9} rotate={-35} />
        <Specular fill={WHITE} opacity={0.9} cx={44} cy={47} rx={5} ry={2.8} rotate={-35} />
      </G>
      <CoinPart id={`${id}-mint`} surface={surface} detail="low" cx={18} cy={34} r={12} tone="mint" glyph="none" rotate={20} glow={false} grounded={false} />
      <Path d={clayPaths.stackSparkleBig} fill={clayRamps.lavender.base} opacity={0.9} />
      <Path d={clayPaths.stackSparkleSmall} fill={surface === "dark" ? WHITE : clayRamps.lavender.base} opacity={0.7} />
    </G>
  );
}

function WalletPart({ id, surface, detail, transform, glow = surface === "dark", grounded = true }: ClayWalletPartProps) {
  const violet = clayRamps.violet;
  const mint = clayRamps.mint;
  const gold = clayRamps.gold;
  const full = detail === "full";
  return (
    <G transform={transform}>
      <Defs>
        {linear(`${id}-noteback`, [[0, mint.base], [1, mint.deep]])}
        {linear(`${id}-note`, [[0, mint.light], [0.6, mint.base], [1, mint.shade]])}
        {radial(`${id}-body`, [[0, violet.light], [0.45, violet.base], [0.8, violet.shade], [1, violet.deep]], 0.3, 0.25, 0.95)}
        {linear(`${id}-core`, [[0, NIGHT, 0], [0.5, NIGHT, 0], [1, NIGHT, 0.22]], 0, 0, 0, 1)}
        {full ? linear(`${id}-lip`, [[0, violet.hi, 0.6], [0.5, violet.hi, 0], [1, violet.edge, 0.35]]) : null}
        {linear(`${id}-strap`, [[0, violet.shade], [1, violet.deep]], 0, 0, 0, 1)}
        {radial(`${id}-clasp`, [[0, gold.light], [0.5, gold.base], [1, gold.shade]], 0.38, 0.34, 0.75)}
        {linear(`${id}-sheen`, [[0, WHITE, 0.45], [1, WHITE, 0]], 0, 0, 1, 0)}
      </Defs>
      <Halo id={id} surface={surface} glow={glow} grounded={grounded} glowBox={{ cx: 80, cy: 74, rx: 78, ry: 64 }} aoBox={{ cx: 84, cy: 128, rx: 58, ry: 8 }} />
      <Rect x={70} y={20} width={70} height={44} rx={6} transform="rotate(-10 105 42)" fill={url(`${id}-noteback`)} />
      <G transform="rotate(-22 93 36)">
        <Rect x={58} y={14} width={70} height={44} rx={6} fill={url(`${id}-note`)} />
        <Circle cx={93} cy={36} r={8} fill="none" stroke={mint.deep} strokeOpacity={0.45} strokeWidth={2.5} />
        <Rect x={59} y={15} width={68} height={42} rx={5.5} fill="none" stroke={mint.hi} strokeOpacity={0.6} strokeWidth={1.5} />
      </G>
      <Rect x={23} y={51} width={116} height={70} rx={18} fill={violet.edge} />
      <Rect x={18} y={46} width={116} height={70} rx={18} fill={url(`${id}-body`)} />
      <Rect x={18} y={46} width={116} height={70} rx={18} fill={url(`${id}-core`)} />
      {full ? <Rect x={19.25} y={47.25} width={113.5} height={67.5} rx={16.75} fill="none" stroke={url(`${id}-lip`)} strokeWidth={2.5} /> : null}
      {full ? <Rect x={26} y={54} width={100} height={54} rx={12} fill="none" stroke={violet.hi} strokeOpacity={0.45} strokeWidth={1.6} strokeDasharray="5 4" /> : null}
      <Rect x={107} y={73} width={42} height={26} rx={13} fill={violet.edge} />
      <Rect x={104} y={70} width={42} height={26} rx={13} fill={url(`${id}-strap`)} />
      <Rect x={110} y={73} width={26} height={4} rx={2} fill={WHITE} opacity={0.3} />
      <Circle cx={126.5} cy={84.5} r={9} fill={gold.edge} />
      <Circle cx={125} cy={83} r={9} fill={url(`${id}-clasp`)} />
      <Circle cx={125} cy={83} r={4} fill={gold.deep} opacity={0.55} />
      <Specular fill={WHITE} opacity={0.9} cx={122} cy={79} rx={2.6} ry={1.4} rotate={-30} />
      <Rect x={28} y={50} width={62} height={7} rx={3.5} fill={url(`${id}-sheen`)} />
      <Ellipse cx={36} cy={60} rx={6} ry={2.6} fill={WHITE} opacity={0.55} />
      <Path d="M36 114H116" fill="none" stroke={clayRamps.lavender.base} strokeOpacity={0.4} strokeWidth={2} strokeLinecap="round" />
    </G>
  );
}

const RECEIPT_ROWS = [
  { y: 34, width: 46 },
  { y: 46, width: 38 },
  { y: 58, width: 44 },
  { y: 70, width: 30 },
] as const;

function ReceiptPart({ id, surface, detail, transform, stamp = "check", glow = surface === "dark", grounded = true }: ClayReceiptPartProps) {
  const cloud = clayRamps.cloud;
  const lavender = clayRamps.lavender;
  const violet = clayRamps.violet;
  return (
    <G transform={transform}>
      <Defs>
        <ClipPath id={`${id}-clip`}>
          <Path d={CLAY_RECEIPT_PAPER} clipRule="nonzero" />
        </ClipPath>
        {linear(`${id}-paper`, [[0, cloud.hi], [0.45, cloud.light], [0.8, cloud.base], [1, cloud.shade]], 0, 0, 0.9, 1)}
        {linear(`${id}-side`, [[0, cloud.edge, 0], [1, cloud.edge, 0.2]], 0, 0, 1, 0)}
        {linear(`${id}-roll`, [[0, WHITE], [0.7, cloud.shade], [1, cloud.deep]], 0, 0, 0, 1)}
        {linear(`${id}-total`, [[0, violet.light], [1, violet.shade]])}
        {radial(`${id}-spec`, clayMaterial.specular)}
      </Defs>
      <Halo id={id} surface={surface} glow={glow} grounded={grounded} glowBox={{ cx: 60, cy: 76, rx: 58, ry: 72 }} aoBox={{ cx: 64, cy: 143, rx: 42, ry: 6 }} />
      <G transform="rotate(-6 60 75)">
        {surface === "light" ? <Path d={CLAY_RECEIPT_PAPER} fill="none" stroke={cloud.deep} strokeOpacity={0.7} strokeWidth={1.5} strokeLinejoin="round" /> : null}
        <Path d={CLAY_RECEIPT_PAPER} transform="translate(4 4)" fill={cloud.deep} />
        <Path d={CLAY_RECEIPT_PAPER} fill={url(`${id}-paper`)} />
        <G clipPath={url(`${id}-clip`)} clipRule="nonzero">
          <Rect x={82} y={8} width={14} height={128} fill={url(`${id}-side`)} />
        </G>
        <Rect x={20} y={4} width={80} height={12} rx={6} fill={url(`${id}-roll`)} />
        <Rect x={28} y={6} width={40} height={2.5} rx={1.25} fill={WHITE} opacity={0.9} />
        {RECEIPT_ROWS.map((row, index) => (
          <G key={index}>
            <Rect x={34} y={row.y} width={row.width} height={5} rx={2.5} fill={lavender.base} opacity={0.55} />
            <Rect x={34} y={row.y + 5.5} width={row.width} height={1.2} rx={0.6} fill={WHITE} opacity={0.8} />
            <Rect x={row.width > 40 ? 84 : 76} y={row.y} width={row.width > 40 ? 4 : 12} height={5} rx={2} fill={lavender.base} opacity={0.55} />
          </G>
        ))}
        <Path d="M34 84H86" fill="none" stroke={lavender.base} strokeOpacity={0.6} strokeWidth={1.5} strokeDasharray="4 3" strokeLinecap="round" />
        <Rect x={34} y={94} width={24} height={7} rx={3.5} fill={violet.base} opacity={0.85} />
        <Rect x={64} y={93} width={24} height={9} rx={4.5} fill={url(`${id}-total`)} />
        {stamp === "none" ? null : <BadgePart id={`${id}-stamp`} surface={surface} detail={detail} cx={84} cy={110} r={12} tone="mint" glyph={stamp} />}
        <Ellipse cx={42} cy={24} rx={12} ry={4} fill={url(`${id}-spec`)} />
      </G>
    </G>
  );
}

function PeoplePart({ id, surface, detail, transform, accessory = "plus", glow = surface === "dark", grounded = true }: ClayPeoplePartProps) {
  const cloud = clayRamps.cloud;
  const lavender = clayRamps.lavender;
  const violet = clayRamps.violet;
  return (
    <G transform={transform}>
      <Defs>
        {linear(`${id}-band`, [[0, lavender.shade], [0.3, lavender.base], [0.8, violet.shade], [1, violet.deep]], 0, 0, 1, 0)}
        {radial(`${id}-platform`, [[0, WHITE], [0.6, cloud.base], [1, cloud.shade]], 0.4, 0.3, 0.8)}
        {radial(`${id}-contact`, contactStops(cloud.edge))}
        {radial(`${id}-spec`, clayMaterial.specular)}
        {clayPeopleFigures.flatMap((figure, index) => {
          const ramp = clayRamps[figure.tone];
          return [
            radial(`${id}-body${index}`, [[0, ramp.light], [0.55, ramp.base], [1, ramp.shade]], 0.35, 0.25, 0.9),
            radial(`${id}-head${index}`, [[0, ramp.hi], [0.25, ramp.light], [0.65, ramp.base], [1, ramp.shade]], 0.36, 0.32, 0.75),
            radial(`${id}-neck${index}`, [[0, ramp.edge, 0.4], [1, ramp.edge, 0]]),
          ];
        })}
      </Defs>
      <Halo id={id} surface={surface} glow={glow} grounded={grounded} glowBox={{ cx: 70, cy: 72, rx: 68, ry: 54 }} aoBox={{ cx: 72, cy: 121, rx: 62, ry: 6 }} />
      <Path d={clayPaths.peoplePlatform} fill={url(`${id}-band`)} />
      <Ellipse cx={70} cy={100} rx={58} ry={14} fill={url(`${id}-platform`)} />
      {detail === "full" ? <Path d="M12 100A58 14 0 0 0 128 100" fill="none" stroke={WHITE} strokeOpacity={0.7} strokeWidth={1.5} strokeLinecap="round" /> : null}
      {clayPeopleFigures.map((figure, index) => {
        const { x, baseY, s } = figure;
        return (
          <G key={index}>
            <Ellipse cx={x} cy={baseY} rx={r2(22 * s)} ry={r2(5 * s)} fill={url(`${id}-contact`)} />
            <Path d={clayPaths.peopleBodies[index]} fill={url(`${id}-body${index}`)} />
            <Ellipse cx={x} cy={r2(baseY - 39 * s)} rx={r2(11 * s)} ry={r2(4 * s)} fill={url(`${id}-neck${index}`)} />
            <Circle cx={x} cy={r2(baseY - 55 * s)} r={r2(15 * s)} fill={url(`${id}-head${index}`)} />
            <Specular fill={WHITE} opacity={0.85} cx={x - 5 * s} cy={baseY - 61 * s} rx={4.5 * s} ry={2.8 * s} rotate={-30} />
            <Specular fill={url(`${id}-spec`)} opacity={0.5} cx={x - 10 * s} cy={baseY - 26 * s} rx={5 * s} ry={9 * s} rotate={20} />
          </G>
        );
      })}
      {accessory === "none" ? null : <BadgePart id={`${id}-badge`} surface={surface} detail={detail} cx={116} cy={34} r={15} tone="violet" glyph={accessory} />}
    </G>
  );
}

const CALENDAR_CELLS = [0, 1, 2].flatMap((row) => [0, 1, 2, 3].map((column) => ({ x: 29 + 17 * column, y: 56 + 14 * row, active: row === 1 && column === 2 })));

function CalendarPart({ id, surface, transform, accent = "mint", glow = surface === "dark", grounded = true }: ClayCalendarPartProps) {
  const cloud = clayRamps.cloud;
  const violet = clayRamps.violet;
  const tint = clayRamps[accent];
  return (
    <G transform={transform}>
      <Defs>
        {linear(`${id}-page`, [[0, WHITE], [0.4, cloud.light], [0.8, cloud.base], [1, cloud.shade]], 0, 0, 0.8, 1)}
        {linear(`${id}-header`, [[0, violet.light], [0.55, violet.base], [1, violet.shade]], 0, 0, 0, 1)}
        {linear(`${id}-rod`, [[0, cloud.shade], [0.35, WHITE], [1, cloud.edge]], 0, 0, 1, 0)}
        {radial(`${id}-day`, [[0, tint.light], [0.6, tint.base], [1, tint.shade]], 0.35, 0.3, 0.8)}
      </Defs>
      <Halo id={id} surface={surface} glow={glow} grounded={grounded} glowBox={{ cx: 60, cy: 64, rx: 58, ry: 54 }} aoBox={{ cx: 62, cy: 110, rx: 42, ry: 6 }} />
      {surface === "light" ? <Rect x={18} y={22} width={80} height={78} rx={16} fill="none" stroke={cloud.deep} strokeOpacity={0.7} strokeWidth={1.5} /> : null}
      <Rect x={22} y={27} width={80} height={78} rx={16} fill={cloud.deep} />
      <Rect x={18} y={22} width={80} height={78} rx={16} fill={url(`${id}-page`)} />
      <Path d={CLAY_CALENDAR_HEADER} fill={url(`${id}-header`)} />
      <Rect x={18} y={44} width={80} height={4} fill={violet.deep} opacity={0.18} />
      <Ellipse cx={40} cy={28} rx={10} ry={3} fill={WHITE} opacity={0.4} />
      {[40, 76].map((x) => (
        <G key={x}>
          <Ellipse cx={x} cy={27} rx={5} ry={3} fill={violet.edge} />
          <Rect x={x - 3} y={11} width={6} height={18} rx={3} fill={url(`${id}-rod`)} />
          <Circle cx={x - 0.8} cy={13.5} r={1.6} fill={WHITE} opacity={0.9} />
        </G>
      ))}
      {CALENDAR_CELLS.map((cell, index) =>
        cell.active ? (
          <G key={index}>
            <Rect x={cell.x + 1.5} y={cell.y + 1.5} width={13} height={11} rx={5.5} fill={tint.edge} />
            <Rect x={cell.x} y={cell.y} width={13} height={11} rx={5.5} fill={url(`${id}-day`)} />
            <Specular fill={WHITE} opacity={0.9} cx={cell.x + 4} cy={cell.y + 3} rx={2.4} ry={1.2} rotate={-30} />
          </G>
        ) : (
          <Rect key={index} x={cell.x + 2} y={cell.y + 2} width={9} height={7} rx={3.5} fill={clayRamps.lavender.base} opacity={0.45} />
        ),
      )}
    </G>
  );
}

function TrayPart({ id, surface, transform, glow = surface === "dark", grounded = true }: ClayTrayPartProps) {
  const cloud = clayRamps.cloud;
  const lavender = clayRamps.lavender;
  return (
    <G transform={transform}>
      <Defs>
        {linear(`${id}-wall`, [[0, cloud.deep], [0.3, cloud.base], [0.8, lavender.base], [1, lavender.shade]], 0, 0, 1, 0)}
        {radial(`${id}-rim`, [[0, WHITE], [0.6, cloud.base], [1, cloud.shade]], 0.4, 0.3, 0.8)}
        {linear(`${id}-well`, [[0, cloud.deep], [0.5, cloud.shade], [1, cloud.base]], 0, 0, 0, 1)}
        {radial(`${id}-floor`, [[0, lavender.shade, 0.35], [1, lavender.shade, 0]])}
      </Defs>
      <Halo id={id} surface={surface} glow={glow} grounded={grounded} glowBox={{ cx: 100, cy: 90, rx: 100, ry: 70 }} aoBox={{ cx: 100, cy: 140, rx: 80, ry: 10 }} />
      {surface === "light" ? <Ellipse cx={100} cy={108} rx={76} ry={22} fill="none" stroke={cloud.deep} strokeOpacity={0.8} strokeWidth={2} /> : null}
      <Path d={clayPaths.trayWall} fill={url(`${id}-wall`)} />
      <Ellipse cx={100} cy={108} rx={76} ry={22} fill={url(`${id}-rim`)} />
      <Ellipse cx={100} cy={110} rx={62} ry={16} fill={url(`${id}-well`)} />
      <Ellipse cx={100} cy={112} rx={24} ry={5} fill={url(`${id}-floor`)} />
      <Ellipse cx={100} cy={112} rx={32} ry={7.5} fill="none" stroke={lavender.shade} strokeOpacity={0.55} strokeWidth={1.6} strokeDasharray="4 4" />
      <Path d={clayPaths.trayHighlight} fill="none" stroke={WHITE} strokeOpacity={0.85} strokeWidth={2.5} strokeLinecap="round" />
    </G>
  );
}

/** Scene parts for composing several pieces inside one Svg root (the splash). Ids must be unique per part. */
export const ClayParts = {
  Coin: CoinPart,
  CoinFlat: CoinFlatPart,
  Badge: BadgePart,
  Cloud: CloudPart,
  Puff: PuffPart,
  CoinStack: CoinStackPart,
  Wallet: WalletPart,
  Receipt: ReceiptPart,
  People: PeoplePart,
  Calendar: CalendarPart,
  Tray: TrayPart,
} as const;

// ---------------------------------------------------------------------------------------------------------
// Components

const warnedSizes = new Set<string>();

function useClayPrefix(name: ClayName) {
  const reactId = useId();
  return useMemo(() => clayIdPrefix(reactId, name), [reactId, name]);
}

const hiddenFromScreenReaders = {
  accessibilityElementsHidden: true,
  importantForAccessibility: "no-hide-descendants",
  "aria-hidden": true,
} as const;

function ClayRoot({ name, size, accessibilityLabel, style, children }: { name: ClayName; size: number; accessibilityLabel?: string; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const viewBox = clayViewBox[name];
  const height = clayHeightFor(name, size);
  if (__DEV__ && size < clayMinSize[name]) {
    const key = `${name}:${size}`;
    if (!warnedSizes.has(key)) {
      warnedSizes.add(key);
      console.warn(`Clay "${name}" drawn at ${size}pt, below its ${clayMinSize[name]}pt minimum. Use an Icon on a tinted tile instead.`);
    }
  }
  const accessibility = accessibilityLabel ? { accessible: true, accessibilityRole: "image" as const, accessibilityLabel } : hiddenFromScreenReaders;
  return (
    <View pointerEvents="none" style={[{ width: size, height }, style]} {...accessibility}>
      <Svg width={size} height={height} viewBox={`0 0 ${viewBox.w} ${viewBox.h}`} preserveAspectRatio="xMidYMid meet">
        {children}
      </Svg>
    </View>
  );
}

export type ClayCoinProps = ClayCommonProps & { tone?: ClayCoinTone; glyph?: ClayGlyph | "none"; glyphStyle?: ClayGlyphStyle; tilt?: number };

export const ClayCoin = memo(function ClayCoin({ size, surface = "light", glow, grounded = true, accessibilityLabel, style, tone = "gold", glyph = "exchange", glyphStyle = "emboss", tilt = 0 }: ClayCoinProps) {
  const id = useClayPrefix("coin");
  return (
    <ClayRoot name="coin" size={size} accessibilityLabel={accessibilityLabel} style={style}>
      <CoinPart
        id={id}
        surface={surface}
        detail={clayDetailFor("coin", size)}
        cx={54}
        cy={52}
        r={40}
        depth={[8, 7]}
        tone={tone}
        glyph={glyph}
        glyphStyle={glyphStyle}
        rotate={tilt}
        glow={glow ?? surface === "dark"}
        grounded={grounded}
      />
    </ClayRoot>
  );
});

export type ClayCoinStackProps = ClayCommonProps;

export const ClayCoinStack = memo(function ClayCoinStack({ size, surface = "light", glow, grounded = true, accessibilityLabel, style }: ClayCoinStackProps) {
  const id = useClayPrefix("coin-stack");
  return (
    <ClayRoot name="coin-stack" size={size} accessibilityLabel={accessibilityLabel} style={style}>
      <CoinStackPart id={id} surface={surface} detail={clayDetailFor("coin-stack", size)} glow={glow ?? surface === "dark"} grounded={grounded} />
    </ClayRoot>
  );
});

export type ClayCloudProps = ClayCommonProps & { tone?: "cloud" | "lavenderCloud"; mirror?: boolean };

export const ClayCloud = memo(function ClayCloud({ size, surface = "light", glow, accessibilityLabel, style, tone = "cloud", mirror = false }: ClayCloudProps) {
  const id = useClayPrefix("cloud");
  return (
    <ClayRoot name="cloud" size={size} accessibilityLabel={accessibilityLabel} style={style}>
      <Halo id={id} surface={surface} glow={glow ?? surface === "dark"} grounded={false} glowBox={{ cx: 100, cy: 68, rx: 98, ry: 62 }} aoBox={{ cx: 100, cy: 124, rx: 70, ry: 5 }} />
      <CloudPart id={id} surface={surface} detail={clayDetailFor("cloud", size)} tone={tone} mirror={mirror} />
    </ClayRoot>
  );
});

export type ClayWalletProps = ClayCommonProps;

export const ClayWallet = memo(function ClayWallet({ size, surface = "light", glow, grounded = true, accessibilityLabel, style }: ClayWalletProps) {
  const id = useClayPrefix("wallet");
  return (
    <ClayRoot name="wallet" size={size} accessibilityLabel={accessibilityLabel} style={style}>
      <WalletPart id={id} surface={surface} detail={clayDetailFor("wallet", size)} glow={glow ?? surface === "dark"} grounded={grounded} />
    </ClayRoot>
  );
});

export type ClayReceiptProps = ClayCommonProps & { stamp?: "check" | "plus" | "none" };

export const ClayReceipt = memo(function ClayReceipt({ size, surface = "light", glow, grounded = true, accessibilityLabel, style, stamp = "check" }: ClayReceiptProps) {
  const id = useClayPrefix("receipt");
  return (
    <ClayRoot name="receipt" size={size} accessibilityLabel={accessibilityLabel} style={style}>
      <ReceiptPart id={id} surface={surface} detail={clayDetailFor("receipt", size)} stamp={stamp} glow={glow ?? surface === "dark"} grounded={grounded} />
    </ClayRoot>
  );
});

export type ClayPeopleProps = ClayCommonProps & { accessory?: "plus" | "check" | "none" };

export const ClayPeople = memo(function ClayPeople({ size, surface = "light", glow, grounded = true, accessibilityLabel, style, accessory = "plus" }: ClayPeopleProps) {
  const id = useClayPrefix("people");
  return (
    <ClayRoot name="people" size={size} accessibilityLabel={accessibilityLabel} style={style}>
      <PeoplePart id={id} surface={surface} detail={clayDetailFor("people", size)} accessory={accessory} glow={glow ?? surface === "dark"} grounded={grounded} />
    </ClayRoot>
  );
});

export type ClayBadgeProps = ClayCommonProps & { tone?: ClayBadgeTone; glyph?: ClayGlyph };

export const ClayBadge = memo(function ClayBadge({ size, surface = "light", glow, grounded = true, accessibilityLabel, style, tone = "mint", glyph = "check" }: ClayBadgeProps) {
  const id = useClayPrefix("badge");
  return (
    <ClayRoot name="badge" size={size} accessibilityLabel={accessibilityLabel} style={style}>
      <Halo
        id={id}
        surface={surface}
        glow={glow ?? surface === "dark"}
        grounded={grounded}
        glowTone={tone === "mint" ? "mint" : "lavender"}
        glowBox={{ cx: 60, cy: 58, rx: 52, ry: 48 }}
        aoBox={{ cx: 60, cy: 108, rx: 36, ry: 6 }}
      />
      <BadgePart id={id} surface={surface} detail={clayDetailFor("badge", size)} cx={60} cy={54} r={40} tone={tone} glyph={glyph} />
    </ClayRoot>
  );
});

export type ClayCalendarProps = ClayCommonProps & { accent?: "mint" | "violet" };

export const ClayCalendar = memo(function ClayCalendar({ size, surface = "light", glow, grounded = true, accessibilityLabel, style, accent = "mint" }: ClayCalendarProps) {
  const id = useClayPrefix("calendar");
  return (
    <ClayRoot name="calendar" size={size} accessibilityLabel={accessibilityLabel} style={style}>
      <CalendarPart id={id} surface={surface} detail={clayDetailFor("calendar", size)} accent={accent} glow={glow ?? surface === "dark"} grounded={grounded} />
    </ClayRoot>
  );
});

export type ClayEmptyProps = ClayCommonProps & { subject: ClayEmptySubject };

/** "Nothing here yet": an empty lavender tray with a dashed landing ring; the subject floats above it. */
export const ClayEmpty = memo(function ClayEmpty({ size, surface = "light", glow, grounded = true, accessibilityLabel, style, subject }: ClayEmptyProps) {
  const id = useClayPrefix("empty");
  const detail = clayDetailFor("empty", size);
  const dark = surface === "dark";
  return (
    <ClayRoot name="empty" size={size} accessibilityLabel={accessibilityLabel} style={style}>
      <TrayPart id={`${id}-tray`} surface={surface} detail={detail} glow={glow ?? dark} grounded={grounded} />
      <CloudPart id={`${id}-cloud`} surface={surface} detail="low" tone="cloud" transform="translate(12 30) scale(0.42)" />
      {subject === "activity" ? (
        <CalendarPart id={`${id}-subject`} surface={surface} detail={detail} transform="translate(68 18) scale(0.6)" accent="mint" glow={false} grounded={false} />
      ) : subject === "groups" ? (
        <PeoplePart id={`${id}-subject`} surface={surface} detail={detail} transform="translate(58 22) scale(0.62)" accessory="none" glow={false} grounded={false} />
      ) : subject === "expenses" ? (
        <ReceiptPart id={`${id}-subject`} surface={surface} detail={detail} transform="translate(76 14) scale(0.52)" stamp="none" glow={false} grounded={false} />
      ) : (
        <BadgePart id={`${id}-subject`} surface={surface} detail={detail} cx={102} cy={60} r={26} tone="mint" glyph="check" />
      )}
      <Path d={clayPaths.emptySparkleBig} fill={dark ? WHITE : clayRamps.lavender.base} opacity={0.9} />
      <Path d={clayPaths.emptySparkleSmall} fill={clayRamps.mint.light} opacity={0.95} />
    </ClayRoot>
  );
});
