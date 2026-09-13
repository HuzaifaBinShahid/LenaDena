import { View } from "react-native";
import { Text } from "@/components/ui/Text";
import { router } from "expo-router";
import { Icon } from "@/components/ui/Icon";
import { Touch } from "@/components/ui/Touch";
import { Avatar } from "@/components/ui/Avatar";
import { colors } from "@/theme/tokens";

type AppHeaderProps = {
  name: string;
  avatarUrl?: string;
  connection: "loading" | "live" | "demo" | "error";
};

export function AppHeader({ name, avatarUrl, connection }: AppHeaderProps) {
  const status = connection === "live" ? "Synced" : connection === "loading" ? "Connecting" : connection === "error" ? "Offline" : "Demo";
  const statusColor = connection === "live" ? colors.mint : connection === "error" ? colors.coral : colors.lime;
  return (
    <View className="flex-row items-center justify-between px-5 pb-4 pt-2">
      <View className="flex-row items-center gap-3">
        <Avatar name={name} uri={avatarUrl} size="sm" inverted />
        <Text className="text-[22px] font-bold tracking-tight text-white">{name}</Text>
      </View>
      <View className="flex-row items-center gap-2">
        <View className="h-9 flex-row items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3">
          <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusColor }} />
          <Text className="text-[11px] font-semibold text-white/75">{status}</Text>
        </View>
        <Touch
          onPress={() => router.push("/settings")}
          className="h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/10"
          accessibilityRole="button"
          accessibilityLabel="Open settings"
          hitSlop={8}
          haptic
        >
          <Icon name="options" size={20} color={colors.white} />
        </Touch>
      </View>
    </View>
  );
}
