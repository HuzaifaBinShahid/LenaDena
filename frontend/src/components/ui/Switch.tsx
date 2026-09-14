import { createElement } from "react";
import { Pressable, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import Animated, { interpolateColor, useAnimatedStyle, useDerivedValue, useReducedMotion, withSpring } from "react-native-reanimated";
import { Spinner } from "@/components/ui/Spinner";
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
  const reduceMotion = useReducedMotion();
  const progress = useDerivedValue(
    () => (reduceMotion ? Number(value) : withSpring(Number(value), { damping: 18, stiffness: 280 })),
    [reduceMotion, value],
  );
  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [colors.surface, colors.violet]),
  }));
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * THUMB_TRAVEL }],
  }));
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
      createElement(Animated.View, { style: [styles.thumb, thumbStyle] }, busy ? <Spinner tone="violet" /> : null),
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
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: colors.white,
    shadowColor: colors.plum,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 2,
  },
});
