import { createElement, useEffect, useId, useMemo, useRef } from "react";
import type { AccessibilityActionEvent, LayoutChangeEvent } from "react-native";
import { StyleSheet, Text as NativeText, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { Easing, FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Defs, Line, LinearGradient, Path, Stop } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/Spinner";
import { areaPath, linePath, nearestIndex, scaleSeries, type Point } from "@/lib/curve";
import { colors } from "@/theme/tokens";

export const CHART = { H: 176, Y_TOP: 52, Y_BASE: 160, PAD_X: 24, GRID_Y: [52, 88, 124] } as const;

export type AreaChartProps = {
  width: number;
  /** One value per bucket, in minor units (normally 4 or more). */
  values: readonly number[];
  side: "incoming" | "outgoing";
  activeIndex: number | null;
  tooltip: string | null;
  state: "ready" | "flat" | "loading";
  /** Copy shown over the flat baseline when the state is not ready. */
  overlay?: { icon: IconName; title: string; detail: string };
  /** Changing it remounts the curve with a short fade (side, period, currency, filters). */
  animationKey: string;
  onSelect: (index: number) => void;
  accessibilityLabel: string;
  accessibilityValue: string;
};

type Overlay = NonNullable<AreaChartProps["overlay"]>;

const FALLBACK_OVERLAY: Overlay = { icon: "pulse", title: "Nothing to chart yet", detail: "Entries you add will draw a curve here." };

const SIDE_COLORS = {
  incoming: { halo: "#6FE0B838", dot: colors.mintBright, tipBackground: colors.lime, tipText: colors.night },
  outgoing: { halo: "#FF8DA638", dot: colors.coralBright, tipBackground: colors.coralSoft, tipText: colors.ink },
} as const;

const MARKER_EASING = Easing.out(Easing.cubic);

/** Horizontal shift that keeps a tooltip of width `tipWidth` centred on `x` inside [8, width − 8]. The left edge wins when it cannot fit. */
function tooltipShift(x: number, tipWidth: number, width: number): number {
  "worklet";
  const half = tipWidth / 2;
  let shift = 0;
  if (x + half > width - 8) shift = width - 8 - (x + half);
  if (x - half + shift < 8) shift = 8 - (x - half);
  return shift;
}

/**
 * Activity area chart (§2.20). A series with nothing positive, fewer than two points, or a non-ready state draws a flat
 * dashed baseline with an overlay instead of a curve, so an empty account never sees a broken path.
 */
export function AreaChart({
  width,
  values,
  side,
  activeIndex,
  tooltip,
  state,
  overlay,
  animationKey,
  onSelect,
  accessibilityLabel,
  accessibilityValue,
}: AreaChartProps) {
  const reduceMotion = useReducedMotion();
  const fillId = `area-fill-${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  const { H, Y_BASE, Y_TOP, PAD_X, GRID_Y } = CHART;
  const W = Number.isFinite(width) ? Math.max(0, Math.round(width * 10) / 10) : 0;
  const count = values.length;

  const hasShape = count >= 2 && values.some((value) => Number.isFinite(value) && value > 0);
  const ready = state === "ready" && hasShape && W > 0;
  const loading = state === "loading";

  const points = useMemo<Point[]>(
    () => (ready ? scaleSeries(values, { width: W, top: Y_TOP, base: Y_BASE, padX: PAD_X }) : []),
    [ready, values, W, Y_TOP, Y_BASE, PAD_X],
  );
  const flatLine = `M0 ${Y_BASE} L${W} ${Y_BASE}`;
  const line = ready ? linePath(points, W) || flatLine : flatLine;
  const area = ready ? areaPath(points, W, H) || `${flatLine} L${W} ${H} L0 ${H} Z` : `${flatLine} L${W} ${H} L0 ${H} Z`;

  const selected = activeIndex === null || !Number.isFinite(activeIndex) || count === 0
    ? null
    : Math.min(count - 1, Math.max(0, Math.round(activeIndex)));
  const markerPoint = ready && selected !== null ? points[selected] : undefined;
  const sideColors = SIDE_COLORS[side];

  // Marker motion: transform and opacity only.
  const mx = useSharedValue<number>(0);
  const my = useSharedValue<number>(Y_BASE);
  const shown = useSharedValue(0);
  const tipWidth = useSharedValue(0);
  const lastIndex = useSharedValue(-1);
  const wasShown = useRef(false);
  const shownKey = useRef(animationKey);

  const targetX = markerPoint?.x;
  const targetY = markerPoint?.y;
  useEffect(() => {
    lastIndex.value = selected ?? -1;
    if (targetX === undefined || targetY === undefined) {
      shown.value = 0;
      wasShown.current = false;
      return;
    }
    // Jump (no slide in from a stale spot) when the marker first appears or the content swapped.
    const jump = reduceMotion || !wasShown.current || shownKey.current !== animationKey;
    if (jump) {
      mx.value = targetX;
      my.value = targetY;
    } else {
      const timing = { duration: 160, easing: MARKER_EASING };
      mx.value = withTiming(targetX, timing);
      my.value = withTiming(targetY, timing);
    }
    shown.value = 1;
    wasShown.current = true;
    shownKey.current = animationKey;
  }, [targetX, targetY, selected, animationKey, reduceMotion, lastIndex, mx, my, shown]);

  const layerStyle = useAnimatedStyle(() => ({ opacity: shown.value }));
  const guideStyle = useAnimatedStyle(() => ({ transform: [{ translateX: mx.value - 1 }, { translateY: my.value + 9 }] }));
  const haloStyle = useAnimatedStyle(() => ({ transform: [{ translateX: mx.value - 14 }, { translateY: my.value - 14 }] }));
  const dotStyle = useAnimatedStyle(() => ({ transform: [{ translateX: mx.value - 7 }, { translateY: my.value - 7 }] }));
  const tooltipStyle = useAnimatedStyle(() => {
    const shift = tooltipShift(mx.value, tipWidth.value, W);
    return {
      opacity: tipWidth.value > 0 ? 1 : 0,
      transform: [{ translateX: mx.value - tipWidth.value / 2 + shift }, { translateY: my.value - 46 }],
    };
  });
  const nubStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -tooltipShift(mx.value, tipWidth.value, W) }, { rotate: "45deg" }],
  }));

  const gesture = useMemo(() => {
    const padX = PAD_X;
    const pan = Gesture.Pan()
      .enabled(ready)
      .activeOffsetX([-8, 8])
      .failOffsetY([-12, 12])
      .onUpdate((event) => {
        const index = nearestIndex(event.x, W, count, padX);
        if (index !== lastIndex.value) {
          lastIndex.value = index;
          scheduleOnRN(onSelect, index);
        }
      });
    const tap = Gesture.Tap()
      .enabled(ready)
      .maxDuration(250)
      .onEnd((event, success) => {
        if (!success) return;
        const index = nearestIndex(event.x, W, count, padX);
        if (index !== lastIndex.value) {
          lastIndex.value = index;
          scheduleOnRN(onSelect, index);
        }
      });
    // ComposedGesture has no enabled(); each gesture is enabled only while the chart is ready.
    return Gesture.Exclusive(pan, tap);
  }, [ready, W, count, PAD_X, lastIndex, onSelect]);

  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (!ready || count === 0) return;
    const name = event.nativeEvent.actionName;
    let next = selected;
    if (name === "increment") next = selected === null ? 0 : Math.min(count - 1, selected + 1);
    if (name === "decrement") next = selected === null ? count - 1 : Math.max(0, selected - 1);
    if (next !== null && next !== selected) onSelect(next);
  };

  const shownOverlay = overlay ?? FALLBACK_OVERLAY;
  const accessibility = ready
    ? {
      accessible: true,
      accessibilityRole: "adjustable" as const,
      accessibilityLabel,
      accessibilityValue: { text: accessibilityValue },
      accessibilityActions: [{ name: "increment" }, { name: "decrement" }],
      onAccessibilityAction,
    }
    : {
      accessible: true,
      accessibilityRole: "image" as const,
      accessibilityLabel: loading ? `${accessibilityLabel}, loading` : shownOverlay.title,
      accessibilityHint: loading ? undefined : shownOverlay.detail,
    };

  if (W <= 0) {
    // Until the parent measures a width there is nothing to draw; keep the height so the layout does not jump.
    return createElement(View, { style: styles.placeholder, ...accessibility });
  }

  const svgLayer = createElement(
    Animated.View,
    { key: animationKey, entering: reduceMotion ? undefined : FadeIn.duration(200), pointerEvents: "none", style: StyleSheet.absoluteFill },
    <Svg width={W} height={H} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Defs>
        <LinearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.lavender} stopOpacity={0.38} />
          <Stop offset="0.5" stopColor={colors.violet} stopOpacity={0.2} />
          <Stop offset="1" stopColor={colors.violet} stopOpacity={0.04} />
        </LinearGradient>
      </Defs>
      {GRID_Y.map((y) => (
        <Line key={y} x1={0} y1={y} x2={W} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth={1} strokeDasharray={[2, 6]} />
      ))}
      <Path d={area} fill={`url(#${fillId})`} opacity={ready ? 1 : 0.5} />
      {ready ? (
        <Path d={line} fill="none" stroke={colors.lavender} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <Path d={line} fill="none" stroke="rgba(181,165,255,0.5)" strokeWidth={2} strokeDasharray={[6, 6]} strokeLinecap="round" />
      )}
    </Svg>,
  );

  const marker = ready
    ? createElement(
      Animated.View,
      { key: "marker", pointerEvents: "none", style: [StyleSheet.absoluteFill, layerStyle] },
      createElement(
        Animated.View,
        { style: [styles.guide, guideStyle] },
        <Svg width={2} height={H}>
          <Line x1={1} y1={0} x2={1} y2={H} stroke="rgba(255,255,255,0.5)" strokeWidth={1.5} strokeDasharray={[4, 5]} />
        </Svg>,
      ),
      createElement(Animated.View, { style: [styles.halo, { backgroundColor: sideColors.halo }, haloStyle] }),
      createElement(Animated.View, { style: [styles.dot, { backgroundColor: sideColors.dot }, dotStyle] }),
      tooltip
        ? createElement(
          Animated.View,
          {
            style: [styles.tooltip, { backgroundColor: sideColors.tipBackground, maxWidth: Math.max(64, W - 16) }, tooltipStyle],
            onLayout: (event: LayoutChangeEvent) => {
              tipWidth.value = event.nativeEvent.layout.width;
            },
          },
          createElement(Animated.View, { style: [styles.nub, { backgroundColor: sideColors.tipBackground }, nubStyle] }),
          createElement(
            NativeText,
            { numberOfLines: 1, maxFontSizeMultiplier: 1.2, style: [styles.tooltipText, { color: sideColors.tipText }] },
            tooltip,
          ),
        )
        : null,
    )
    : null;

  const overlayLayer = ready
    ? null
    : loading
      ? createElement(View, { key: "loading", pointerEvents: "none", style: styles.loading }, <Spinner tone="light" />)
      : createElement(
        View,
        { key: "overlay", pointerEvents: "none", style: [styles.overlay, { width: Math.max(0, W - 80) }] },
        createElement(View, { style: styles.overlayTile }, <Icon name={shownOverlay.icon} size={20} color={colors.lavender} />),
        createElement(NativeText, { numberOfLines: 2, style: styles.overlayTitle }, shownOverlay.title),
        createElement(NativeText, { numberOfLines: 3, style: styles.overlayDetail }, shownOverlay.detail),
      );

  return (
    <GestureDetector gesture={gesture}>
      {createElement(
        Animated.View,
        { style: [styles.root, { width: W }], ...accessibility },
        svgLayer,
        marker,
        overlayLayer,
      )}
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    height: CHART.H,
  },
  root: {
    height: CHART.H,
    // Clips the dashed guide, which runs past the chart bottom.
    overflow: "hidden",
  },
  guide: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 2,
    height: CHART.H,
  },
  halo: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  dot: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2.5,
    borderColor: colors.white,
  },
  tooltip: {
    position: "absolute",
    left: 0,
    top: 0,
    height: 30,
    minWidth: 64,
    borderRadius: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.night,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  nub: {
    position: "absolute",
    bottom: -4,
    left: "50%",
    marginLeft: -5,
    width: 10,
    height: 10,
  },
  tooltipText: {
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 13,
    lineHeight: 18,
  },
  loading: {
    position: "absolute",
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: CHART.H - CHART.Y_BASE,
  },
  overlay: {
    position: "absolute",
    top: 26,
    left: 40,
    alignItems: "center",
  },
  overlayTile: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  overlayTitle: {
    marginTop: 10,
    textAlign: "center",
    fontFamily: "Manrope_700Bold",
    fontSize: 15,
    lineHeight: 20,
    color: colors.white,
  },
  overlayDetail: {
    marginTop: 4,
    maxWidth: 240,
    textAlign: "center",
    fontFamily: "Manrope_500Medium",
    fontSize: 12,
    lineHeight: 17,
    color: "rgba(255,255,255,0.62)",
  },
});
