import { View } from "react-native";
import { Icon } from "@/components/ui/Icon";
import { groupSkin } from "@/features/groups/groupSkin";

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
  const config = dimensions[size];
  // The stored accent is decoration only: it always goes through a fixed LenaDena skin, never rendered raw (§1.7).
  const skin = groupSkin(accent);
  return (
    <View className={`${config.frame} items-center justify-center`} style={{ backgroundColor: skin.tint }}>
      <Icon name="users" size={config.icon} color={skin.icon} />
    </View>
  );
}
