import { View } from "react-native";
import { Text } from "@/components/ui/Text";

type BadgeProps = {
  label: string;
  tone?: "neutral" | "positive" | "warning" | "danger";
};

const toneClasses = {
  neutral: "bg-surface text-slate",
  positive: "bg-mint-soft text-mint",
  warning: "bg-gold-soft text-gold",
  danger: "bg-coral-soft text-coral",
};

export function Badge({ label, tone = "neutral" }: BadgeProps) {
  const [background, text] = toneClasses[tone].split(" ");
  return (
    <View className={`self-start rounded-full px-2.5 py-1 ${background}`}>
      <Text className={`text-[11px] font-semibold ${text}`}>{label}</Text>
    </View>
  );
}
