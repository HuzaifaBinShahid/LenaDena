import { createElement } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Touch } from "@/components/ui/Touch";
import { shadows } from "@/theme/shadows";
import { colors } from "@/theme/tokens";

export type FabButtonProps = {
  size: 52 | 60 | 62;
  /** violet (gradient) on or next to dark surfaces; plum on light stages (D5). */
  tone: "violet" | "plum";
  /** Default "plus". */
  icon?: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  containerStyle?: StyleProp<ViewStyle>;
  disabled?: boolean;
};

const ICON_SIZES = { 52: 26, 60: 28, 62: 30 } as const;
const VIOLET_GRADIENT = [colors.lavender, colors.violet, colors.violetStrong] as const;
const PLUM_SHADOW = { ...shadows.float, shadowOffset: { width: -4, height: 12 }, shadowOpacity: 0.35 };

/** Round floating "+" button. The shadow sits on the solid container; the pressable clips the gradient and ring. */
export function FabButton({ size, tone, icon = "plus", onPress, accessibilityLabel, accessibilityHint, containerStyle, disabled = false }: FabButtonProps) {
  const violet = tone === "violet";
  const box = { width: size, height: size, borderRadius: size / 2 };

  return (
    <Touch
      onPress={onPress}
      disabled={disabled}
      haptic
      pressedScale={0.92}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      containerStyle={[
        box,
        { backgroundColor: violet ? colors.violet : colors.plum },
        violet ? shadows.float : PLUM_SHADOW,
        containerStyle,
      ]}
      // Touch animates the container's opacity, so the disabled dimming lives on the pressable.
      pressableStyle={[box, styles.pressable, disabled ? styles.disabled : null]}
    >
      {violet ? (
        <LinearGradient
          pointerEvents="none"
          colors={VIOLET_GRADIENT}
          locations={[0, 0.45, 1]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {createElement(View, {
        pointerEvents: "none",
        style: [StyleSheet.absoluteFill, { borderRadius: size / 2, borderWidth: 1, borderColor: violet ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.12)" }],
      })}
      <Icon name={icon} size={ICON_SIZES[size]} color={colors.white} />
    </Touch>
  );
}

const styles = StyleSheet.create({
  pressable: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: {
    opacity: 0.5,
  },
});
