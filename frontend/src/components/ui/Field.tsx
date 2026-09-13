import type { ReactNode } from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/Text";

type FieldProps = {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
};

export function Field({ label, required = false, hint, error, children }: FieldProps) {
  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-1">
        <Text className="text-sm font-bold text-ink">{label}</Text>
        {required ? <Text className="text-sm font-bold text-coral">*</Text> : null}
      </View>
      {children}
      {error ? <Text className="text-xs font-semibold text-coral">{error}</Text> : null}
      {!error && hint ? <Text className="text-xs leading-4 text-slate">{hint}</Text> : null}
    </View>
  );
}
