import { createElement, useEffect } from "react";
import { StyleSheet, Text as NativeText, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { Easing, Extrapolation, interpolate, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { BrandMark } from "@/components/brand/BrandMark";
import { Icon } from "@/components/ui/Icon";
import { colors, motion } from "@/theme/tokens";

type SplashTransitionProps = {
  onFinish: () => void;
};

export function SplashTransition({ onFinish }: SplashTransitionProps) {
  const intro = useSharedValue(0);
  const exit = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: 1 - exit.value,
    transform: [{ scale: 1 + exit.value * 0.025 }],
  }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(intro.value, [0, 0.35, 1], [0, 0.42, 0.18], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(intro.value, [0, 1], [0.55, 1.35], Extrapolation.CLAMP) }],
  }));
  const markStyle = useAnimatedStyle(() => ({
    opacity: interpolate(intro.value, [0, 0.22, 1], [0, 0.75, 1], Extrapolation.CLAMP),
    transform: [
      { scale: interpolate(intro.value, [0, 0.72, 1], [0.62, 1.04, 1], Extrapolation.CLAMP) },
      { rotate: `${interpolate(intro.value, [0, 1], [-9, 0], Extrapolation.CLAMP)}deg` },
    ],
  }));
  const copyStyle = useAnimatedStyle(() => ({
    opacity: interpolate(intro.value, [0.35, 0.82], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(intro.value, [0.35, 1], [14, 0], Extrapolation.CLAMP) }],
  }));
  const leftChipStyle = useAnimatedStyle(() => ({
    opacity: interpolate(intro.value, [0.2, 0.68], [0, 1], Extrapolation.CLAMP),
    transform: [
      { translateX: interpolate(intro.value, [0.2, 1], [-26, 0], Extrapolation.CLAMP) },
      { translateY: interpolate(intro.value, [0.2, 1], [18, 0], Extrapolation.CLAMP) },
      { rotate: `${interpolate(intro.value, [0.2, 1], [-12, -5], Extrapolation.CLAMP)}deg` },
    ],
  }));
  const rightChipStyle = useAnimatedStyle(() => ({
    opacity: interpolate(intro.value, [0.3, 0.78], [0, 1], Extrapolation.CLAMP),
    transform: [
      { translateX: interpolate(intro.value, [0.3, 1], [28, 0], Extrapolation.CLAMP) },
      { translateY: interpolate(intro.value, [0.3, 1], [16, 0], Extrapolation.CLAMP) },
      { rotate: `${interpolate(intro.value, [0.3, 1], [12, 6], Extrapolation.CLAMP)}deg` },
    ],
  }));
  const checkChipStyle = useAnimatedStyle(() => ({
    opacity: interpolate(intro.value, [0.45, 0.88], [0, 1], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(intro.value, [0.45, 1], [24, 0], Extrapolation.CLAMP) },
      { scale: interpolate(intro.value, [0.45, 1], [0.72, 1], Extrapolation.CLAMP) },
    ],
  }));
  const progressStyle = useAnimatedStyle(() => ({
    opacity: interpolate(intro.value, [0.3, 0.65], [0, 1], Extrapolation.CLAMP),
    transform: [{ scaleX: interpolate(intro.value, [0.3, 1], [0.08, 1], Extrapolation.CLAMP) }],
  }));

  useEffect(() => {
    intro.value = withTiming(1, {
      duration: reduceMotion ? 100 : 880,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    });
    exit.value = withDelay(reduceMotion ? 140 : motion.splash - 380, withTiming(1, {
      duration: reduceMotion ? 100 : 380,
      easing: Easing.inOut(Easing.cubic),
    }, (finished) => {
      if (finished) runOnJS(onFinish)();
    }));
  }, [exit, intro, onFinish, reduceMotion]);

  return createElement(
    Animated.View,
    { pointerEvents: "none", style: [styles.overlay, overlayStyle] },
    createElement(LinearGradient, {
      colors: ["#120A29", "#2B1758", "#6544B9"],
      locations: [0, 0.56, 1],
      start: { x: 0.08, y: 0 },
      end: { x: 0.92, y: 1 },
      style: StyleSheet.absoluteFill,
    }),
    createElement(Animated.View, { style: [styles.halo, haloStyle] }),
    createElement(
      Animated.View,
      { style: [styles.chip, styles.leftChip, leftChipStyle] },
      <Icon name="file-text" size={22} color={colors.white} />,
    ),
    createElement(
      Animated.View,
      { style: [styles.chip, styles.rightChip, rightChipStyle] },
      <Icon name="users" size={22} color={colors.white} />,
    ),
    createElement(
      Animated.View,
      { style: [styles.checkChip, checkChipStyle] },
      <Icon name="check" size={22} color={colors.ink} />,
    ),
    createElement(
      Animated.View,
      { style: [styles.markShell, markStyle] },
      createElement(View, { style: styles.markGlass }, <BrandMark size="lg" showName={false} tone="light" />),
    ),
    createElement(
      Animated.View,
      { style: [styles.copy, copyStyle] },
      createElement(NativeText, { style: styles.name }, "LenaDena"),
      createElement(NativeText, { style: styles.tagline }, "Shared money, minus the awkward."),
    ),
    createElement(
      View,
      { style: styles.progressTrack },
      createElement(Animated.View, { style: [styles.progressFill, progressStyle] }),
    ),
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 50,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  halo: {
    position: "absolute",
    width: 270,
    height: 270,
    borderRadius: 135,
    backgroundColor: colors.lavender,
  },
  markShell: {
    alignItems: "center",
    justifyContent: "center",
  },
  markGlass: {
    width: 132,
    height: 132,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 42,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    backgroundColor: "rgba(255,255,255,0.1)",
    shadowColor: "#0B0618",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.28,
    shadowRadius: 28,
    elevation: 12,
  },
  chip: {
    position: "absolute",
    width: 54,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  leftChip: {
    left: "17%",
    top: "34%",
  },
  rightChip: {
    right: "17%",
    top: "38%",
  },
  checkChip: {
    position: "absolute",
    top: "55%",
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    borderWidth: 5,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: colors.lime,
  },
  copy: {
    position: "absolute",
    top: "63%",
    alignItems: "center",
  },
  name: {
    color: colors.white,
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 31,
    letterSpacing: -1,
  },
  tagline: {
    marginTop: 8,
    color: "rgba(246,242,255,0.66)",
    fontFamily: "Manrope_500Medium",
    fontSize: 13,
    letterSpacing: 0.1,
  },
  progressTrack: {
    position: "absolute",
    bottom: 54,
    width: 88,
    height: 3,
    overflow: "hidden",
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  progressFill: {
    width: 88,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.lavender,
  },
});
