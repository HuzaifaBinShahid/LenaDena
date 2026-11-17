import "../../global.css";
import { Manrope_400Regular } from "@expo-google-fonts/manrope/400Regular";
import { Manrope_500Medium } from "@expo-google-fonts/manrope/500Medium";
import { Manrope_600SemiBold } from "@expo-google-fonts/manrope/600SemiBold";
import { Manrope_700Bold } from "@expo-google-fonts/manrope/700Bold";
import { Manrope_800ExtraBold } from "@expo-google-fonts/manrope/800ExtraBold";
import { useFonts } from "expo-font";
import { useCallback, useEffect, useRef, useState } from "react";
import { Stack, usePathname, useRouter, type Href } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { AuthProvider, useAuth } from "@/features/auth/AuthProvider";
import { LedgerProvider } from "@/features/ledger/LedgerProvider";
import { SplashTransition } from "@/components/brand/SplashTransition";
import { PreferencesProvider } from "@/features/preferences/PreferencesProvider";
import { PushBridge } from "@/features/push/PushBridge";
import { AppLockProvider } from "@/features/security/AppLockProvider";
import { ToastProvider } from "@/components/ui/Toast";
import { useTheme } from "@/theme/ThemeProvider";
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
                    <RecoveryRedirect />
                    <PushBridge />
                    <ThemedStack />
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

/** A password-reset link signs the person in, but they must choose a new password before anything else. */
function RecoveryRedirect() {
  const { recovering } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (recovering && pathname !== "/reset-password") router.replace("/reset-password" as Href);
  }, [pathname, recovering, router]);
  return null;
}

/** Screen transitions paint the theme canvas, so dark mode never flashes a light frame between routes. */
function ThemedStack() {
  const { colors: theme } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, animation: "fade_from_bottom", contentStyle: { backgroundColor: theme.canvas } }}>
      <Stack.Screen name="auth" options={{ animation: "fade", contentStyle: { backgroundColor: colors.night } }} />
      <Stack.Screen name="reset-password" options={{ animation: "fade", gestureEnabled: false, contentStyle: { backgroundColor: colors.night } }} />
    </Stack>
  );
}
