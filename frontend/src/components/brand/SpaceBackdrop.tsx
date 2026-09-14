import { createElement, useEffect, useState } from "react";
import type { LayoutChangeEvent } from "react-native";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { Easing, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import Svg, { Circle, ClipPath, Defs, Ellipse, G, LinearGradient as SvgGradient, Path, RadialGradient, Stop } from "react-native-svg";
import { colors } from "@/theme/tokens";

// The scene is drawn once in a 430 x 560 space (an iPhone Pro Max width) and scaled to the screen.
const SCENE_WIDTH = 430;
const SCENE_HEIGHT = 560;
const PLANET = { x: 292, y: 96, r: 178 };
const MOON = { x: 12, y: 214, r: 38 };
const RING_TILT = -16;
/** On phones the form sits over the lower scene; keep that area clear of stars so fields read cleanly. */
const FORM_ZONE = { top: 318, left: 18, right: 412 };

export const skyColors = [colors.night, "#170C3A", "#26115A", "#1E0B47"] as const;
const skyStops = [0, 0.34, 0.7, 1] as const;

type Star = { x: number; y: number; r: number; opacity: number };

function seededStars(count: number, seed: number): Star[] {
  let state = seed;
  const next = () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
  return Array.from({ length: count }, () => ({ x: next() * SCENE_WIDTH, y: next() * SCENE_HEIGHT, r: 0.5 + next() * 1.1, opacity: 0.3 + next() * 0.65 }));
}

const allStars = seededStars(46, 1789);
const starsAboveForm = allStars.filter((star) => star.y < FORM_ZONE.top || star.x < FORM_ZONE.left || star.x > FORM_ZONE.right);
const sparkles = [
  { x: 70, y: 128, size: 5 },
  { x: 384, y: 296, size: 6.5 },
  { x: 214, y: 430, size: 4, belowForm: true },
  { x: 404, y: 520, size: 5, belowForm: true },
];

function sparklePath(x: number, y: number, size: number) {
  const waist = size * 0.2;
  return `M${x} ${y - size} L${x + waist} ${y - waist} L${x + size} ${y} L${x + waist} ${y + waist} L${x} ${y + size} L${x - waist} ${y + waist} L${x - size} ${y} L${x - waist} ${y - waist} Z`;
}

function ringArc(rx: number, ry: number, half: "back" | "front") {
  // Sweep 1 traces the upper (far) half, sweep 0 the lower (near) half that crosses in front of the planet.
  return `M${PLANET.x - rx} ${PLANET.y} A${rx} ${ry} 0 0 ${half === "back" ? 1 : 0} ${PLANET.x + rx} ${PLANET.y}`;
}

function SkyLayer({ clearFormZone }: { clearFormZone: boolean }) {
  const stars = clearFormZone ? starsAboveForm : allStars;
  return (
    <>
      <Defs>
        <RadialGradient id="nebulaViolet" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#7A5CFA" stopOpacity="0.42" />
          <Stop offset="0.55" stopColor="#5B34C9" stopOpacity="0.15" />
          <Stop offset="1" stopColor="#3B1A8F" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="nebulaOrchid" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#A54FD8" stopOpacity="0.3" />
          <Stop offset="1" stopColor="#A54FD8" stopOpacity="0" />
        </RadialGradient>
        <SvgGradient id="streak" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0.85" />
        </SvgGradient>
      </Defs>
      <Ellipse cx={310} cy={150} rx={300} ry={250} fill="url(#nebulaViolet)" />
      {/* Kept inside the scene bounds so its fade never meets the edge as a hard line. */}
      <Ellipse cx={30} cy={400} rx={220} ry={130} fill="url(#nebulaOrchid)" />
      {stars.map((star, index) => <Circle key={index} cx={star.x} cy={star.y} r={star.r} fill="#FFFFFF" opacity={star.opacity} />)}
      {sparkles.filter((sparkle) => !(clearFormZone && sparkle.belowForm)).map((sparkle, index) => (
        <Path key={index} d={sparklePath(sparkle.x, sparkle.y, sparkle.size)} fill="#FFFFFF" opacity={0.9} />
      ))}
      <Path d="M318 278 L376 330" stroke="url(#streak)" strokeWidth={1.6} strokeLinecap="round" />
    </>
  );
}

function MoonLayer() {
  return (
    <>
      <Defs>
        <RadialGradient id="moonBody" cx="0.66" cy="0.32" r="0.82">
          <Stop offset="0" stopColor="#F7F0FF" />
          <Stop offset="0.45" stopColor="#CDB6F6" />
          <Stop offset="1" stopColor="#7458C4" />
        </RadialGradient>
      </Defs>
      <Circle cx={MOON.x} cy={MOON.y} r={MOON.r} fill="url(#moonBody)" />
      <Circle cx={MOON.x + 16} cy={MOON.y - 15} r={8} fill="#8A68D2" opacity={0.32} />
      <Circle cx={MOON.x + 28} cy={MOON.y + 10} r={4.5} fill="#8A68D2" opacity={0.28} />
      <Circle cx={MOON.x + 8} cy={MOON.y + 22} r={6.5} fill="#8A68D2" opacity={0.26} />
    </>
  );
}

function PlanetLayer() {
  const { x, y, r } = PLANET;
  return (
    <>
      <Defs>
        <RadialGradient id="planetBody" cx="0.36" cy="0.36" r="0.78" fx="0.3" fy="0.34">
          <Stop offset="0" stopColor="#A2F2DA" />
          <Stop offset="0.34" stopColor="#52D1BA" />
          <Stop offset="0.7" stopColor="#2B90B9" />
          <Stop offset="1" stopColor="#22508F" />
        </RadialGradient>
        <SvgGradient id="planetShade" x1="0.2" y1="0.12" x2="0.88" y2="0.96">
          <Stop offset="0" stopColor={colors.night} stopOpacity="0" />
          <Stop offset="0.58" stopColor={colors.night} stopOpacity="0.08" />
          <Stop offset="1" stopColor={colors.night} stopOpacity="0.58" />
        </SvgGradient>
        <ClipPath id="planetClip">
          <Circle cx={x} cy={y} r={r} />
        </ClipPath>
      </Defs>
      <G transform={`rotate(${RING_TILT} ${x} ${y})`}>
        <Path d={ringArc(262, 54, "back")} stroke="#D9D0FF" strokeOpacity={0.26} strokeWidth={1.3} fill="none" />
        <Path d={ringArc(300, 70, "back")} stroke="#D9D0FF" strokeOpacity={0.12} strokeWidth={1} fill="none" />
      </G>
      <Circle cx={x} cy={y} r={r} fill="url(#planetBody)" />
      <G clipPath="url(#planetClip)">
        {/* Marbled cloud bands, echoing the reference planet's surface. */}
        <Path d="M110 150 C160 118 205 152 240 138 C282 122 302 162 352 150 C402 138 432 172 480 160 L480 300 L110 300 Z" fill="#1D5E93" opacity={0.3} />
        <Path d="M150 58 C176 38 216 54 231 80 C246 106 216 126 190 118 C164 110 130 84 150 58 Z" fill="#2479A8" opacity={0.34} />
        <Path d="M196 -22 C240 -2 300 -12 342 8 C384 30 424 18 480 30 L480 -100 L196 -100 Z" fill="#C8FFF0" opacity={0.14} />
        <Path d="M330 58 C362 42 402 58 412 90 C422 122 392 136 364 126 C338 116 308 80 330 58 Z" fill="#1F6A9C" opacity={0.3} />
        <Path d="M238 168 C264 156 300 166 306 188 C312 210 280 222 254 214 C228 206 218 182 238 168 Z" fill="#9BF1D6" opacity={0.17} />
        <Path d="M120 210 C150 196 190 214 214 236 C236 256 206 280 170 272 C136 264 96 228 120 210 Z" fill="#17497F" opacity={0.28} />
        <Circle cx={x} cy={y} r={r} fill="url(#planetShade)" />
      </G>
      <Circle cx={x} cy={y} r={r} fill="none" stroke="#CFFFF0" strokeOpacity={0.24} strokeWidth={1} />
      <G transform={`rotate(${RING_TILT} ${x} ${y})`}>
        <Path d={ringArc(262, 54, "front")} stroke="#E6DEFF" strokeOpacity={0.5} strokeWidth={1.3} fill="none" />
        <Path d={ringArc(300, 70, "front")} stroke="#E6DEFF" strokeOpacity={0.2} strokeWidth={1} fill="none" />
        {/* The mint exchange dot from the LD monogram, riding the near ring. */}
        <Circle cx={x - 202} cy={y + 34} r={11} fill={colors.lime} opacity={0.16} />
        <Circle cx={x - 202} cy={y + 34} r={5} fill={colors.lime} />
      </G>
    </>
  );
}

type SpaceBackdropProps = {
  /** `top` pins the scene to the top of a phone screen; `cover` fills a wide panel edge to edge. */
  fit?: "top" | "cover";
  /** Off for surfaces that must be complete immediately, such as the app-switcher privacy cover. */
  animated?: boolean;
};

export function SpaceBackdrop({ fit = "top", animated = true }: SpaceBackdropProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const reduceMotion = useReducedMotion();
  const still = reduceMotion || !animated;
  const intro = useSharedValue(still ? 1 : 0);

  useEffect(() => {
    if (still) return;
    intro.value = withDelay(80, withTiming(1, { duration: 1150, easing: Easing.out(Easing.cubic) }));
  }, [intro, still]);

  const skyStyle = useAnimatedStyle(() => ({ opacity: interpolate(intro.value, [0, 0.6], [0, 1], "clamp") }));
  const planetStyle = useAnimatedStyle(() => ({
    opacity: interpolate(intro.value, [0, 0.55], [0, 1], "clamp"),
    transform: [{ translateX: (1 - intro.value) * 18 }, { translateY: (1 - intro.value) * -14 }],
  }));
  const moonStyle = useAnimatedStyle(() => ({
    opacity: interpolate(intro.value, [0.15, 0.75], [0, 1], "clamp"),
    transform: [{ translateX: (1 - intro.value) * -14 }],
  }));

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width !== size.width || height !== size.height) setSize({ width, height });
  };

  const sceneHeight = fit === "top" ? (size.width * SCENE_HEIGHT) / SCENE_WIDTH : size.height;
  const svgProps = {
    width: size.width,
    height: sceneHeight,
    viewBox: `0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`,
    preserveAspectRatio: fit === "top" ? "xMidYMin meet" : "xMaxYMid slice",
  };
  const layer = [styles.layer, { height: sceneHeight }];

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={onLayout}>
      <LinearGradient colors={skyColors} locations={skyStops} style={StyleSheet.absoluteFill} />
      {size.width > 0 ? (
        <>
          {createElement(Animated.View, { style: [layer, skyStyle] }, <Svg {...svgProps}><SkyLayer clearFormZone={fit === "top"} /></Svg>)}
          {createElement(Animated.View, { style: [layer, moonStyle] }, <Svg {...svgProps}><MoonLayer /></Svg>)}
          {createElement(Animated.View, { style: [layer, planetStyle] }, <Svg {...svgProps}><PlanetLayer /></Svg>)}
          {/* Shade behind the header so the brand and mode link stay legible over the planet. */}
          <LinearGradient colors={["rgba(13,7,32,0.58)", "rgba(13,7,32,0)"]} style={[styles.scrim, { height: fit === "top" ? sceneHeight * 0.26 : 160 }]} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  scrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
});
