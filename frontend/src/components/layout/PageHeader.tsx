import { View } from "react-native";
import { Text } from "@/components/ui/Text";
import { router } from "expo-router";
import { colors } from "@/theme/tokens";
import { Touch } from "@/components/ui/Touch";
import { Icon } from "@/components/ui/Icon";

type PageHeaderProps = {
  title: string;
  subtitle?: string;
};

export function PageHeader({ title, subtitle }: PageHeaderProps) {
  return (
    <View className="flex-row items-center gap-3 pb-7 pt-2">
      <Touch
        onPress={() => router.back()}
        className="h-11 w-11 items-center justify-center rounded-full border border-line bg-raised shadow-sm shadow-black/5"
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={8}
      >
        <Icon name="arrow-left" size={20} color={colors.ink} />
      </Touch>
      <View className="flex-1">
        <Text className="text-[22px] font-bold tracking-tight text-ink">{title}</Text>
        {subtitle ? <Text className="mt-0.5 text-[13px] text-slate">{subtitle}</Text> : null}
      </View>
    </View>
  );
}
