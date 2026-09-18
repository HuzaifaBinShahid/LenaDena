import { View } from "react-native";
import { Text } from "@/components/ui/Text";
import { LinearGradient } from "expo-linear-gradient";
import { CoinMark } from "@/components/brand/CoinMark";
import { colors } from "@/theme/tokens";

type BrandMarkProps = {
  size?: "sm" | "md" | "lg";
  showName?: boolean;
  tone?: "light" | "dark";
};

// Tile sizes are unchanged from the original monogram, so screens keep their layout.
const sizes = {
  sm: { frame: 40, radius: 14, coin: 30, text: "text-lg" },
  md: { frame: 54, radius: 18, coin: 40, text: "text-2xl" },
  lg: { frame: 76, radius: 24, coin: 56, text: "text-[30px]" },
};

/** The app-icon tile (violet ground, split gold coin) with the optional LenaDena wordmark. */
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
        <CoinMark size={config.coin} />
      </LinearGradient>
      {showName ? <Text className={`${config.text} font-bold tracking-tight ${tone === "light" ? "text-white" : "text-ink"}`}>LenaDena</Text> : null}
    </View>
  );
}
