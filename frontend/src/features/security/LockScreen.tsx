import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, StyleSheet, useWindowDimensions, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BrandMark } from "@/components/brand/BrandMark";
import { SpaceBackdrop } from "@/components/brand/SpaceBackdrop";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Text } from "@/components/ui/Text";
import { Touch } from "@/components/ui/Touch";
import { useToast } from "@/components/ui/Toast";
import { useLedger } from "@/features/ledger/LedgerProvider";
import type { BiometricCapability } from "@/features/security/biometrics";
import { authenticationFailureMessage, isCancelledAuthentication, isMissingDeviceCredential } from "@/features/security/lock-policy";
import type { UnlockResult } from "@/features/security/AppLockProvider";
import { errorMessage } from "@/lib/api";
import { colors } from "@/theme/tokens";

type LockScreenProps = {
  capability: BiometricCapability | null;
  canPrompt: boolean;
  onUnlock: () => Promise<UnlockResult>;
  /** Resolves true only when the phone has no passcode or biometrics left. */
  onTurnOff: () => Promise<boolean>;
  onSignOut?: () => Promise<void>;
};

export function LockScreen({ capability, canPrompt, onUnlock, onTurnOff, onSignOut }: LockScreenProps) {
  const toast = useToast();
  const { plan } = useLedger();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [busy, setBusy] = useState(false);
  const [credentialMissing, setCredentialMissing] = useState(false);
  const prompted = useRef(false);
  const label = capability?.label ?? "Face ID";
  const glyph = capability?.kind === "face" ? "face-id" : "finger-print";
  const firstName = plan.user.id === "loading" ? "" : plan.user.name.trim().split(/\s+/)[0] ?? "";
  const headingSize = Math.min(52, width * 0.125);

  const attemptUnlock = useCallback(async () => {
    setBusy(true);
    const result = await onUnlock();
    setBusy(false);
    if (result.ok || isCancelledAuthentication(result.error)) return;
    if (isMissingDeviceCredential(result.error)) setCredentialMissing(true);
    const failure = authenticationFailureMessage(result.error, label);
    toast.show({ title: failure.title, message: failure.message, tone: failure.tone });
  }, [label, onUnlock, toast]);

  // Each lock mounts a fresh screen, so the system prompt opens once per lock, as soon as the app is in front.
  useEffect(() => {
    if (!canPrompt) return;
    const promptOnce = () => {
      if (prompted.current || AppState.currentState !== "active") return;
      prompted.current = true;
      void attemptUnlock();
    };
    promptOnce();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") promptOnce();
    });
    return () => subscription.remove();
  }, [attemptUnlock, canPrompt]);

  const turnOff = async () => {
    if (await onTurnOff()) {
      toast.info("App lock is off", "This phone no longer has a passcode or biometrics to check.");
      return;
    }
    setCredentialMissing(false);
    toast.warning("App lock stays on", `This phone can check it's you again. Unlock with ${label}.`);
  };

  const signOut = async () => {
    if (!onSignOut) return;
    try {
      await onSignOut();
    } catch (error) {
      toast.error("Couldn't sign out", errorMessage(error));
    }
  };

  return (
    <View style={styles.overlay} accessibilityViewIsModal>
      <StatusBar style="light" />
      <SpaceBackdrop fit={width >= 900 ? "cover" : "top"} />
      <View style={[styles.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.header}>
          <BrandMark size="sm" tone="light" />
        </View>
        <View style={styles.fill} />
        <View style={styles.body}>
          <View style={styles.glyph}>
            <Icon name={glyph} size={28} color={colors.white} />
          </View>
          <Text className="font-extrabold uppercase text-white" style={{ fontSize: headingSize, lineHeight: Math.round(headingSize * 1.06), letterSpacing: -1 }} accessibilityRole="header">
            {firstName ? "Welcome back," : "Welcome back"}
          </Text>
          {firstName ? (
            <Text numberOfLines={1} className="font-extrabold uppercase" style={{ fontSize: headingSize, lineHeight: Math.round(headingSize * 1.06), letterSpacing: -1, color: colors.lavender }}>
              {firstName}
            </Text>
          ) : null}
          <Text className="mt-4 text-[13px] font-semibold text-white/80">LenaDena is locked to keep your balances private.</Text>
          <View style={styles.actions}>
            <Button label={`Unlock with ${label}`} icon={glyph} variant="gradient" size="lg" fullWidth loading={busy} onPress={attemptUnlock} />
            {credentialMissing ? <Button label="Turn off app lock" icon="lock-closed" variant="glass" fullWidth disabled={busy} onPress={turnOff} /> : null}
            {onSignOut ? (
              <Touch onPress={() => void signOut()} disabled={busy} accessibilityRole="button" accessibilityLabel="Not you? Sign out" pressableStyle={styles.signOut} hitSlop={6}>
                <Text className="text-[12.5px] font-medium text-white/60">
                  Not you? <Text className="text-[12.5px] font-bold text-white">Sign out</Text>
                </Text>
              </Touch>
            ) : null}
          </View>
          {capability?.faceIdNeedsDevelopmentBuild ? (
            <Text className="mt-2 text-center text-[11px] leading-4 text-white/45">Expo Go can't use Face ID, so iOS asks for your passcode. Face ID works in a development build.</Text>
          ) : null}
        </View>
        <View style={styles.bottomSpace} />
      </View>
    </View>
  );
}

/** Shown while the app is inactive so the app switcher never captures balances. */
export function PrivacyCover() {
  return (
    <View style={[styles.overlay, styles.cover]} pointerEvents="none">
      <SpaceBackdrop animated={false} />
      <BrandMark size="lg" tone="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    // Above the app, below the launch splash (50) and toasts.
    zIndex: 45,
    elevation: 45,
    backgroundColor: colors.night,
  },
  cover: {
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  fill: {
    flex: 1,
  },
  header: {
    minHeight: 48,
    justifyContent: "center",
  },
  body: {
    width: "100%",
    maxWidth: 440,
    alignSelf: "center",
  },
  glyph: {
    width: 60,
    height: 60,
    marginBottom: 22,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.09)",
  },
  actions: {
    marginTop: 22,
    gap: 6,
  },
  signOut: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  bottomSpace: {
    height: 32,
  },
});
