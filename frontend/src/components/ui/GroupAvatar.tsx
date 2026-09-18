import { View } from "react-native";
import { Icon } from "@/components/ui/Icon";
import { groupSkin, groupSkinTone } from "@/features/groups/groupSkin";
import { useTheme } from "@/theme/ThemeProvider";

type GroupAvatarProps = {
  name: string;
  accent: string;
  size?: "sm" | "md" | "lg";
};

const dimensions = {
  sm: { frame: "h-10 w-10 rounded-[14px]", icon: 18 },
  md: { frame: "h-12 w-12 rounded-2xl", icon: 21 },
  lg: { frame: "h-14 w-14 rounded-[18px]", icon: 24 },
};

export function GroupAvatar({ accent, size = "md" }: GroupAvatarProps) {
  const { scheme } = useTheme();
  const config = dimensions[size];
  // The stored accent is decoration only: it always goes through a fixed LenaDena skin, never rendered raw (§1.7).
  // Light uses the skin's pastel tile; dark swaps it for the deep themed tint so the tile never glows.
  const tone = groupSkinTone(groupSkin(accent), scheme);
  return (
    <View className={`${config.frame} items-center justify-center`} style={{ backgroundColor: tone.tint }}>
      <Icon name="users" size={config.icon} color={tone.icon} />
    </View>
  );
}
