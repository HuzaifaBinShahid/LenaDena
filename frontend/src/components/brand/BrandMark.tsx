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
  sm: { frame: 40, radius: 14, mark: 16, dot: 6, text: "text-lg" },
  md: { frame: 54, radius: 18, mark: 22, dot: 7, text: "text-2xl" },
  lg: { frame: 76, radius: 24, mark: 31, dot: 9, text: "text-[30px]" },
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
        <Text className="font-extrabold text-white" style={{ fontSize: config.mark, lineHeight: config.mark * 1.15, letterSpacing: -1.8 }}>LD</Text>
        <View style={{ position: "absolute", right: config.frame * 0.13, top: config.frame * 0.16, width: config.dot, height: config.dot, borderRadius: config.dot, backgroundColor: colors.lime }} />
      </LinearGradient>
      {showName ? <Text className={`${config.text} font-bold tracking-tight ${tone === "light" ? "text-white" : "text-ink"}`}>LenaDena</Text> : null}
    </View>
  );
}
