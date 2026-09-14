import type { ReactNode } from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/Text";
import { colors } from "@/theme/tokens";

type FieldProps = {
  /** Omit only when the input carries its own accessibilityLabel and a group heading names the fields. */
  label?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  appearance?: "light" | "dark";
  children: ReactNode;
};

export function Field({ label, required = false, hint, error, appearance = "light", children }: FieldProps) {
  const dark = appearance === "dark";
  return (
    <View className="gap-2">
      {label ? (
        <View className="flex-row items-center gap-1">
          <Text className={`text-sm font-bold ${dark ? "text-white/85" : "text-ink"}`}>{label}</Text>
          {required ? <Text className={`text-sm font-bold ${dark ? "text-lavender" : "text-coral"}`}>*</Text> : null}
        </View>
      ) : null}
      {children}
      {error ? <Text className={`text-xs font-semibold ${dark ? "" : "text-coral"}`} style={dark ? { color: colors.coralBright } : undefined}>{error}</Text> : null}
      {!error && hint ? <Text className={`text-xs leading-4 ${dark ? "text-white/55" : "text-slate"}`}>{hint}</Text> : null}
    </View>
  );
}
