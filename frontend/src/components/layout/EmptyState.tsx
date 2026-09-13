import { View } from "react-native";
import { Text } from "@/components/ui/Text";
import { Icon, type IconName } from "@/components/ui/Icon";
import { colors } from "@/theme/tokens";
import { Button } from "@/components/ui/Button";

type EmptyStateProps = {
  icon: IconName;
  title: string;
  detail: string;
  action?: { label: string; onPress: () => void };
};

export function EmptyState({ icon, title, detail, action }: EmptyStateProps) {
  return (
    <View className="items-center rounded-card border border-line bg-raised px-6 py-10 shadow-sm shadow-black/5">
      <View className="h-14 w-14 items-center justify-center rounded-[18px] bg-violet-soft">
        <Icon name={icon} size={25} color={colors.violet} />
      </View>
      <Text className="mt-4 text-center text-lg font-bold text-ink">{title}</Text>
      <Text className="mt-2 text-center text-sm leading-5 text-slate">{detail}</Text>
      {action ? <View className="mt-5"><Button label={action.label} onPress={action.onPress} /></View> : null}
    </View>
  );
}
