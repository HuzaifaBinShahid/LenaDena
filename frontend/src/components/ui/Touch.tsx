import { createElement, type PropsWithChildren } from "react";
import type { PressableProps, StyleProp, ViewStyle } from "react-native";
import { Pressable, StyleSheet, View } from "react-native";
import * as Haptics from "expo-haptics";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { motion } from "@/theme/tokens";

type TouchProps = PropsWithChildren<PressableProps & {
  className?: string;
  containerStyle?: StyleProp<ViewStyle>;
  pressableStyle?: StyleProp<ViewStyle>;
  haptic?: boolean;
  pressedScale?: number;
}>;

export function Touch({ children, className, containerStyle, pressableStyle, onPress, onPressIn, onPressOut, disabled, haptic = false, pressedScale = 0.975, style, ...props }: TouchProps) {
  const pressed = useSharedValue(0);
  const reduceMotion = useReducedMotion();
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 1 - pressed.value * 0.08,
    transform: [{ scale: reduceMotion ? 1 : 1 - pressed.value * (1 - pressedScale) }],
  }), [pressedScale, reduceMotion]);

  return createElement(
    Animated.View,
    { style: [containerStyle, animatedStyle] },
    createElement(
      Pressable,
      {
        ...props,
        disabled,
        style: typeof style === "function"
          ? (state) => [styles.pressable, pressableStyle, style(state)]
          : [styles.pressable, pressableStyle, style],
        onPress: (event) => {
          if (haptic && !disabled) void Haptics.selectionAsync().catch(() => undefined);
          onPress?.(event);
        },
        onPressIn: (event) => {
          pressed.value = withTiming(1, { duration: motion.tapIn });
          onPressIn?.(event);
        },
        onPressOut: (event) => {
          pressed.value = withTiming(0, { duration: motion.tapOut });
          onPressOut?.(event);
        },
      },
      className ? <View className={className}>{children}</View> : children,
    ),
  );
}

const styles = StyleSheet.create({
  pressable: {
    alignSelf: "stretch",
  },
});
