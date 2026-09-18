import { createElement } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useFrameCallback, useReducedMotion, useSharedValue, type SharedValue } from "react-native-reanimated";

type ListeningDotsProps = {
  color: string;
  /** Dot diameter. */
  size?: number;
};

/** One bounce cycle; each dot starts a beat after the one before it. */
const PERIOD_MS = 1050;
const STAGGER_MS = 150;
/** Share of the cycle a dot spends in the air; the rest it rests, so the dots read as a wave. */
const AIRTIME = 0.46;

/**
 * Three dots that bounce one after another while voice input is listening — the same cue chat
 * apps use for "someone is talking". One frame clock drives all three on the UI thread; it stops
 * when the dots unmount. With reduced motion the dots hold still.
 */
export function ListeningDots({ color, size = 6 }: ListeningDotsProps) {
  const reduceMotion = useReducedMotion();
  const clock = useSharedValue(0);
  useFrameCallback((frame) => {
    clock.value = frame.timeSinceFirstFrame;
  }, !reduceMotion);

  return createElement(
    View,
    { style: [styles.row, { gap: size * 0.7, height: size * 3 }], pointerEvents: "none" },
    [0, 1, 2].map((index) => <Dot key={index} index={index} clock={clock} color={color} size={size} still={reduceMotion} />),
  );
}

function Dot({ index, clock, color, size, still }: { index: number; clock: SharedValue<number>; color: string; size: number; still: boolean }) {
  const lift = size * 0.9;
  const style = useAnimatedStyle(() => {
    if (still) return { opacity: 1, transform: [{ translateY: 0 }] };
    const elapsed = clock.value - index * STAGGER_MS;
    const cycle = (((elapsed % PERIOD_MS) + PERIOD_MS) % PERIOD_MS) / PERIOD_MS;
    const height = elapsed < 0 || cycle > AIRTIME ? 0 : Math.sin((cycle / AIRTIME) * Math.PI);
    return {
      opacity: 0.45 + height * 0.55,
      transform: [{ translateY: -height * lift }],
    };
  });
  return createElement(Animated.View, {
    style: [{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style],
  });
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
});
