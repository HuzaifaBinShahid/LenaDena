import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { usePreferences } from "@/features/preferences/PreferencesProvider";

type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  className?: string;
};

export function Screen({ children, scroll = true, className = "" }: ScreenProps) {
  const { palette } = usePreferences();
  if (!scroll) {
    return <SafeAreaView className={`flex-1 bg-canvas ${className}`} style={{ backgroundColor: palette.screen }}><StatusBar style="dark" />{children}</SafeAreaView>;
  }
  return (
    <SafeAreaView className={`flex-1 bg-canvas ${className}`} style={{ backgroundColor: palette.screen }} edges={["top"]}>
      <StatusBar style="dark" />
      <KeyboardAwareScrollView
        bottomOffset={16}
        keyboardShouldPersistTaps="handled"
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
