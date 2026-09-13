import { ActivityIndicator, View } from "react-native";
import { colors } from "@/theme/tokens";

type SpinnerProps = {
  size?: "small" | "large";
  tone?: "light" | "dark" | "mint" | "violet";
  centered?: boolean;
};

export function Spinner({ size = "small", tone = "violet", centered = false }: SpinnerProps) {
  const color = tone === "light" ? colors.white : tone === "dark" ? colors.ink : tone === "mint" ? colors.mint : colors.violet;
  return (
    <View className={centered ? "flex-1 items-center justify-center" : "items-center justify-center"} accessibilityRole="progressbar">
      <ActivityIndicator size={size} color={color} />
    </View>
  );
}
