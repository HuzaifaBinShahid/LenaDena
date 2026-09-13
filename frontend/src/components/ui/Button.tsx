import type { ReactNode } from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/Text";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/Spinner";
import { Touch } from "@/components/ui/Touch";
import { colors } from "@/theme/tokens";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "bright" | "glass";
type ButtonSize = "sm" | "md" | "lg" | "choice";

type ButtonProps = {
  label: string;
  onPress: () => void | Promise<void>;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconSide?: "left" | "right";
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  accessibilityHint?: string;
  description?: string;
  children?: ReactNode;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-violet border-violet",
  secondary: "bg-raised border-line",
  ghost: "bg-transparent border-transparent",
  danger: "bg-coral-soft border-coral/30",
  bright: "bg-white border-white",
  glass: "bg-white/10 border-white/15",
};

const labelClasses: Record<ButtonVariant, string> = {
  primary: "text-white",
  secondary: "text-ink",
  ghost: "text-violet",
  danger: "text-coral",
  bright: "text-violet-strong",
  glass: "text-white",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-10 px-3.5 rounded-[14px]",
  md: "min-h-12 px-4 rounded-2xl",
  lg: "min-h-14 px-5 rounded-[18px]",
  choice: "min-h-[82px] px-4 rounded-[20px]",
};

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  icon,
  iconSide = "left",
  loading = false,
  disabled = false,
  fullWidth = false,
  accessibilityHint,
  description,
  children,
}: ButtonProps) {
  const blocked = disabled || loading;
  const iconColor = variant === "primary"
    ? colors.white
    : variant === "glass"
      ? colors.white
    : variant === "danger"
      ? colors.coral
      : variant === "ghost"
        ? colors.violet
        : colors.ink;

  return (
    <Touch
      onPress={() => void onPress()}
      containerStyle={{ alignSelf: fullWidth ? "stretch" : "flex-start" }}
      disabled={blocked}
      haptic
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint ?? description}
      accessibilityState={{ disabled: blocked, busy: loading }}
      className={`${fullWidth ? "w-full" : "self-start"} ${variantClasses[variant]} ${sizeClasses[size]} flex-row items-center ${description ? "justify-start gap-3" : "justify-center gap-2"} border ${blocked ? "opacity-45" : "opacity-100"}`}
    >
      {loading ? (
        <Spinner tone={variant === "primary" || variant === "glass" ? "light" : "violet"} />
      ) : (
        description ? (
          <>
            {icon ? (
              <View className={`h-11 w-11 items-center justify-center rounded-2xl ${variant === "primary" ? "bg-white/15" : "bg-violet-soft"}`}>
                <Icon name={icon} size={21} color={variant === "primary" ? colors.white : colors.violet} />
              </View>
            ) : null}
            <View className="min-w-0 flex-1 items-start">
              <Text className={`text-[15px] font-bold ${labelClasses[variant]}`}>{children ?? label}</Text>
              <Text className={`mt-1 text-left text-[11px] leading-4 ${variant === "primary" ? "text-white/70" : "text-slate"}`}>{description}</Text>
            </View>
            <View className={`h-8 w-8 items-center justify-center rounded-full ${variant === "primary" ? "bg-white/15" : "bg-surface"}`}>
              <Icon name="arrow-right" size={16} color={variant === "primary" ? colors.white : colors.violet} />
            </View>
          </>
        ) : (
          <>
            {icon && iconSide === "left" ? <Icon name={icon} size={18} color={iconColor} /> : null}
            <Text className={`text-[15px] font-semibold ${labelClasses[variant]}`}>{children ?? label}</Text>
            {icon && iconSide === "right" ? <Icon name={icon} size={18} color={iconColor} /> : null}
          </>
        )
      )}
    </Touch>
  );
}
