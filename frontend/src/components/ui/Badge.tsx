import { View } from "react-native";
import { Text } from "@/components/ui/Text";

type BadgeProps = {
  label: string;
  tone?: "neutral" | "positive" | "warning" | "danger";
};

// Status reads from the label; the dot adds the semantic color without a pastel fill.
const dotClasses = {
  neutral: "bg-muted",
  positive: "bg-mint",
  warning: "bg-gold",
  danger: "bg-coral",
};

export function Badge({ label, tone = "neutral" }: BadgeProps) {
  return (
    <View className="flex-row items-center gap-1.5 self-start rounded-full border border-line bg-raised px-2.5 py-1">
      <View className={`h-1.5 w-1.5 rounded-full ${dotClasses[tone]}`} />
      <Text className="text-[11px] font-semibold text-ink">{label}</Text>
    </View>
  );
}
