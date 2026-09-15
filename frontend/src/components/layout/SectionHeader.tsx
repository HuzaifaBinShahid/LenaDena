import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { View } from "react-native";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import type { IconName } from "@/components/ui/Icon";

type SectionHeaderProps = {
  title: string;
  detail?: string;
  action?: { label: string; icon?: IconName; onPress: () => void };
  /** Custom right-hand control (for example a 44pt icon button). Replaces `action` and centres the row. */
  trailing?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function SectionHeader({ title, detail, action, trailing, style }: SectionHeaderProps) {
  return (
    <View className={`mb-3 flex-row ${trailing ? "items-center" : "items-end"} justify-between gap-4`} style={style}>
      <View className="flex-1">
        <Text className="text-[20px] font-bold tracking-tight text-ink">{title}</Text>
        {detail ? <Text className="mt-1 text-[13px] leading-5 text-slate">{detail}</Text> : null}
      </View>
      {trailing ? trailing : action ? <Button label={action.label} icon={action.icon} size="sm" variant="ghost" onPress={action.onPress} /> : null}
    </View>
  );
}
