import { createElement } from "react";
import { Pressable, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import Animated, { interpolateColor, useAnimatedStyle, useDerivedValue, useReducedMotion, withSpring } from "react-native-reanimated";
import { Spinner } from "@/components/ui/Spinner";
import { makeStyles, useTheme } from "@/theme/ThemeProvider";
import { colors } from "@/theme/tokens";

type SwitchProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel: string;
  disabled?: boolean;
  busy?: boolean;
};

const TRACK_WIDTH = 52;
const TRACK_HEIGHT = 32;
const THUMB_SIZE = 26;
const TRACK_PADDING = (TRACK_HEIGHT - THUMB_SIZE) / 2;
const THUMB_TRAVEL = TRACK_WIDTH - THUMB_SIZE - TRACK_PADDING * 2;

export function Switch({ value, onValueChange, accessibilityLabel, disabled = false, busy = false }: SwitchProps) {
  const { colors: c, isDark } = useTheme();
  const themed = useThemedStyles();
  const reduceMotion = useReducedMotion();
  const offTrack = c.surface;
  const onTrack = c.violet;
  const progress = useDerivedValue(
    () => (reduceMotion ? Number(value) : withSpring(Number(value), { damping: 18, stiffness: 280 })),
    [reduceMotion, value],
  );
  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [offTrack, onTrack]),
  }));
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * THUMB_TRAVEL }],
  }));
  // Dark mode: the off track is barely lighter than the card behind it, so a lavender ring outlines it and fades
  // out as the violet fills in. Light mode draws no ring, exactly as before.
  const ringStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));
  const blocked = disabled || busy;

  return createElement(
    Pressable,
    {
      onPress: () => {
        void Haptics.selectionAsync().catch(() => undefined);
        onValueChange(!value);
      },
      disabled: blocked,
      hitSlop: 8,
      accessibilityRole: "switch",
      accessibilityLabel,
      accessibilityState: { checked: value, disabled: blocked, busy },
      style: [styles.target, disabled && !busy && styles.disabled],
    },
    createElement(
      Animated.View,
      { style: [styles.track, trackStyle] },
      isDark ? createElement(Animated.View, { pointerEvents: "none", style: [styles.ring, ringStyle] }) : null,
      createElement(Animated.View, { style: [styles.thumb, themed.thumb, thumbStyle] }, busy ? <Spinner tone="violet" /> : null),
    ),
  );
}

const styles = StyleSheet.create({
  target: {
    minHeight: 44,
    justifyContent: "center",
  },
  disabled: {
    opacity: 0.45,
  },
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    padding: TRACK_PADDING,
  },
  ring: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: TRACK_HEIGHT / 2,
    borderWidth: 1.5,
    borderColor: "rgba(181,165,255,0.3)",
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: THUMB_SIZE / 2,
    // The thumb stays white in both themes, like the system switch.
    backgroundColor: colors.white,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 2,
  },
});

const useThemedStyles = makeStyles((c) => ({
  thumb: {
    shadowColor: c.shadow,
  },
}));
