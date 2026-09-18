import type { ReactNode } from "react";
import { StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useTheme } from "@/theme/ThemeProvider";

type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  className?: string;
  /** Paints the status-bar strip, for screens whose content starts with a full-bleed band of this colour. */
  topColor?: string;
};

/**
 * `bottomOffset` is the gap between the keyboard and the caret. A single-line field's caret sits
 * about 20pt above the field's bottom edge, so 72 keeps the whole field, its hint or error, and a
 * little breathing room above the keyboard, instead of leaving the field's edge under it.
 */
const KEYBOARD_CLEARANCE = 72;

export function Screen({ children, scroll = true, className = "", topColor }: ScreenProps) {
  const { colors, isDark } = useTheme();
  const statusBar = <StatusBar style={isDark ? "light" : "dark"} />;
  if (!scroll) {
    return <SafeAreaView className={`flex-1 ${className}`} style={{ backgroundColor: colors.canvas }}>{statusBar}{children}</SafeAreaView>;
  }
  return (
    <SafeAreaView className={`flex-1 ${className}`} style={{ backgroundColor: topColor ?? colors.canvas }} edges={["top"]}>
      {statusBar}
      <KeyboardAwareScrollView
        bottomOffset={KEYBOARD_CLEARANCE}
        keyboardShouldPersistTaps="handled"
        style={topColor ? { backgroundColor: colors.canvas } : undefined}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingBottom: 56,
  },
});
