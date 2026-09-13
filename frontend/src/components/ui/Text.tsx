import type { ComponentProps } from "react";
import { Text as NativeText } from "react-native";

type TextProps = ComponentProps<typeof NativeText> & {
  className?: string;
};

function resolveFont(className?: string) {
  if (className?.includes("font-black") || className?.includes("font-extrabold")) return "Manrope_800ExtraBold";
  if (className?.includes("font-bold")) return "Manrope_700Bold";
  if (className?.includes("font-semibold")) return "Manrope_600SemiBold";
  if (className?.includes("font-medium")) return "Manrope_500Medium";
  return "Manrope_400Regular";
}

export function Text({ className, style, ...props }: TextProps) {
  return <NativeText {...props} className={className} style={[{ fontFamily: resolveFont(className) }, style]} />;
}
