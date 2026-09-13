import { Image, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { colors } from "@/theme/tokens";

type AvatarSize = "sm" | "md" | "lg";

type AvatarProps = {
  name: string;
  uri?: string | null;
  size?: AvatarSize;
  accent?: string;
  inverted?: boolean;
};

const sizes: Record<AvatarSize, { box: number; radius: number; text: string }> = {
  sm: { box: 40, radius: 14, text: "text-sm" },
  md: { box: 48, radius: 17, text: "text-base" },
  lg: { box: 82, radius: 28, text: "text-2xl" },
};

export function Avatar({ name, uri, size = "md", accent = colors.violet, inverted = false }: AvatarProps) {
  const dimensions = sizes[size];
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";

  return (
    <View
      className={`items-center justify-center overflow-hidden border ${inverted ? "border-white/20 bg-white/15" : "border-line bg-violet-soft"}`}
      style={{ width: dimensions.box, height: dimensions.box, borderRadius: dimensions.radius }}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: dimensions.box, height: dimensions.box }} resizeMode="cover" />
      ) : (
        <Text className={`${dimensions.text} font-bold`} style={{ color: inverted ? colors.white : accent }}>{initials}</Text>
      )}
    </View>
  );
}
