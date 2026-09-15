import { Image, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { colors } from "@/theme/tokens";

type AvatarSize = "xs" | "sm" | "md" | "row" | "lg";

type AvatarProps = {
  name: string;
  uri?: string | null;
  size?: AvatarSize;
  accent?: string;
  inverted?: boolean;
  /** "squircle" (default) keeps the size's corner radius; "circle" rounds to half the box. */
  shape?: "squircle" | "circle";
  /** Background colour for the initials fallback. Swaps the line border for a transparent one. */
  tint?: string;
};

const sizes: Record<AvatarSize, { box: number; radius: number; text: string }> = {
  xs: { box: 22, radius: 8, text: "text-[10px]" },
  sm: { box: 40, radius: 14, text: "text-sm" },
  md: { box: 48, radius: 17, text: "text-base" },
  row: { box: 56, radius: 20, text: "text-lg" },
  lg: { box: 82, radius: 28, text: "text-2xl" },
};

export function Avatar({ name, uri, size = "md", accent = colors.violet, inverted = false, shape = "squircle", tint }: AvatarProps) {
  const dimensions = sizes[size];
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";
  // With no `tint` these strings are exactly the original classes, so existing avatars render unchanged.
  const surfaceClass = inverted
    ? tint ? "border-white/20" : "border-white/20 bg-white/15"
    : tint ? "border-transparent" : "border-line bg-violet-soft";
  const radius = shape === "circle" ? dimensions.box / 2 : dimensions.radius;

  return (
    <View
      className={`items-center justify-center overflow-hidden border ${surfaceClass}`}
      style={tint ? { width: dimensions.box, height: dimensions.box, borderRadius: radius, backgroundColor: tint } : { width: dimensions.box, height: dimensions.box, borderRadius: radius }}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: dimensions.box, height: dimensions.box }} resizeMode="cover" />
      ) : (
        <Text className={`${dimensions.text} font-bold`} style={{ color: inverted ? colors.white : accent }}>{initials}</Text>
      )}
    </View>
  );
}
