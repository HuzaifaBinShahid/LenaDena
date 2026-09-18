import { ActivityIndicator, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { colors } from "@/theme/tokens";

type SpinnerProps = {
  size?: "small" | "large";
  /** `light` is white for violet, plum and dark-shell fills in either theme; `dark` is ink and follows the theme. */
  tone?: "light" | "dark" | "mint" | "violet";
  centered?: boolean;
};

export function Spinner({ size = "small", tone = "violet", centered = false }: SpinnerProps) {
  const { colors: c } = useTheme();
  const color = tone === "light" ? colors.white : tone === "dark" ? c.ink : tone === "mint" ? c.mint : c.violet;
  return (
    <View className={centered ? "flex-1 items-center justify-center" : "items-center justify-center"} accessibilityRole="progressbar">
      <ActivityIndicator size={size} color={color} />
    </View>
  );
}
