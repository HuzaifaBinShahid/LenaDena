import "../../global.css";
import { Manrope_400Regular } from "@expo-google-fonts/manrope/400Regular";
import { Manrope_500Medium } from "@expo-google-fonts/manrope/500Medium";
import { Manrope_600SemiBold } from "@expo-google-fonts/manrope/600SemiBold";
import { Manrope_700Bold } from "@expo-google-fonts/manrope/700Bold";
import { Manrope_800ExtraBold } from "@expo-google-fonts/manrope/800ExtraBold";
import { useFonts } from "expo-font";
import { useCallback, useRef, useState } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { LedgerProvider } from "@/features/ledger/LedgerProvider";
import { SplashTransition } from "@/components/brand/SplashTransition";
import { PreferencesProvider } from "@/features/preferences/PreferencesProvider";
import { AppLockProvider } from "@/features/security/AppLockProvider";
import { ToastProvider } from "@/components/ui/Toast";
import { colors } from "@/theme/tokens";

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [showTransition, setShowTransition] = useState(true);
  const finishTransition = useCallback(() => setShowTransition(false), []);
  const nativeSplashHidden = useRef(false);
  const [fontsLoaded, fontError] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  // The custom transition mounts beneath the native splash. Hiding only after that first frame
  // prevents a brief blank frame on slower Android devices.
  const hideNativeSplash = useCallback(() => {
    if (nativeSplashHidden.current) return;
    nativeSplashHidden.current = true;
    void SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* Avoid a keyboard-preload flash competing with the launch splash. */}
        <KeyboardProvider preload={false}>
          <ToastProvider>
            <PreferencesProvider>
              <AuthProvider>
                <LedgerProvider>
                  <AppLockProvider canPrompt={!showTransition}>
                    <StatusBar style="auto" />
                    <Stack screenOptions={{ headerShown: false, animation: "fade_from_bottom", contentStyle: { backgroundColor: "#F6F7FA" } }}>
                      <Stack.Screen name="auth" options={{ animation: "fade", contentStyle: { backgroundColor: colors.night } }} />
                    </Stack>
                  </AppLockProvider>
                </LedgerProvider>
              </AuthProvider>
            </PreferencesProvider>
            {showTransition ? <SplashTransition onReady={hideNativeSplash} onFinish={finishTransition} /> : null}
          </ToastProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
