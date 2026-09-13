import { View } from "react-native";
import { Text } from "@/components/ui/Text";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "@/theme/tokens";

type BrandMarkProps = {
  size?: "sm" | "md" | "lg";
  showName?: boolean;
  tone?: "light" | "dark";
};

const sizes = {
  sm: { frame: 40, radius: 14, dot: 8, line: 17, text: "text-lg" },
  md: { frame: 54, radius: 18, dot: 10, line: 22, text: "text-2xl" },
  lg: { frame: 76, radius: 24, dot: 14, line: 31, text: "text-[30px]" },
};

export function BrandMark({ size = "md", showName = true, tone = "dark" }: BrandMarkProps) {
  const config = sizes[size];
  return (
    <View className="flex-row items-center gap-3">
      <LinearGradient
        colors={[colors.violet, colors.violetStrong]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ width: config.frame, height: config.frame, borderRadius: config.radius, alignItems: "center", justifyContent: "center" }}
      >
        <View style={{ width: config.line, height: 3, borderRadius: 3, backgroundColor: colors.white, transform: [{ rotate: "-38deg" }] }} />
        <View style={{ position: "absolute", left: config.frame * 0.24, top: config.frame * 0.24, width: config.dot, height: config.dot, borderRadius: config.dot, backgroundColor: colors.lime }} />
        <View style={{ position: "absolute", right: config.frame * 0.24, bottom: config.frame * 0.24, width: config.dot, height: config.dot, borderRadius: config.dot, borderWidth: 2, borderColor: colors.white }} />
      </LinearGradient>
      {showName ? <Text className={`${config.text} font-bold tracking-tight ${tone === "light" ? "text-white" : "text-ink"}`}>OweYaar</Text> : null}
    </View>
  );
}
