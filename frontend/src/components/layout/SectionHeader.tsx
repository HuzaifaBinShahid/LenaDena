import { View } from "react-native";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import type { IconName } from "@/components/ui/Icon";

type SectionHeaderProps = {
  title: string;
  detail?: string;
  action?: { label: string; icon?: IconName; onPress: () => void };
};

export function SectionHeader({ title, detail, action }: SectionHeaderProps) {
  return (
    <View className="mb-3 flex-row items-end justify-between gap-4">
      <View className="flex-1">
        <Text className="text-[20px] font-bold tracking-tight text-ink">{title}</Text>
        {detail ? <Text className="mt-1 text-[13px] leading-5 text-slate">{detail}</Text> : null}
      </View>
      {action ? <Button label={action.label} icon={action.icon} size="sm" variant="ghost" onPress={action.onPress} /> : null}
    </View>
  );
}
