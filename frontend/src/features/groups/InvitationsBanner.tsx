import { View } from "react-native";
import { Icon } from "@/components/ui/Icon";
import { Text } from "@/components/ui/Text";
import { Touch } from "@/components/ui/Touch";
import { useTheme } from "@/theme/ThemeProvider";
import { invitationsBannerText } from "./groupRules";

/** A quiet card at the top of home when someone has invited this account to a group: one tap opens the answers. */
export function InvitationsBanner({ count, onPress }: { count: number; onPress: () => void }) {
  const { colors: c } = useTheme();
  const text = invitationsBannerText(count);
  return (
    <Touch onPress={onPress} accessibilityRole="button" accessibilityLabel={text} accessibilityHint="Opens your invitations">
      <View className="flex-row items-center gap-3 rounded-[20px] border border-line bg-raised px-4 py-3" style={{ borderColor: c.violet }}>
        <View className="h-10 w-10 items-center justify-center rounded-[14px] bg-violet-soft">
          <Icon name="mail" size={19} color={c.violet} />
        </View>
        <View className="flex-1">
          <Text className="text-[15px] font-bold text-ink">{text}</Text>
          <Text className="mt-0.5 text-xs text-slate">Tap to accept or decline</Text>
        </View>
        <Icon name="chevron-right" size={16} color={c.muted} />
      </View>
    </Touch>
  );
}
