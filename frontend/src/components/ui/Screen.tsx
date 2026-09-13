import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
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
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="flex-grow px-[18px] pb-14" showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
