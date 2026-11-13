import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AppState, BackHandler, Keyboard, StyleSheet, View } from "react-native";
import type { LocalAuthenticationResult } from "expo-local-authentication";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { ScreenObscuredContext } from "@/components/ui/ScreenObscured";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/features/auth/AuthProvider";
import { goToSignIn } from "@/features/auth/navigation";
import {
  appLockSupported,
  authenticateOwner,
  clearBiometricCredential,
  hasDeviceCredential,
  loadLockPreference,
  loadRememberedAccount,
  readBiometricCapability,
  readBiometricCredential,
  rememberBiometricOfferDismissed,
  saveBiometricCredential,
  saveLockPreference,
  saveRememberedAccount,
  wasBiometricOfferDismissed,
  type BiometricCapability,
} from "@/features/security/biometrics";
import {
  defaultLockPreference,
  isCancelledAuthentication,
  isMissingDeviceCredential,
  resumeAllowance,
  shouldLockOnResume,
  type BiometricCredential,
  type LockDelay,
  type LockPreference,
  type RememberedAccount,
} from "@/features/security/lock-policy";
import { LockScreen, PrivacyCover } from "@/features/security/LockScreen";

export type LockChangeResult =
  | { ok: true }
  | { ok: false; reason: "unavailable" | "cancelled" | "failed"; error?: string };

export type UnlockResult = { ok: true } | { ok: false; error: string };

/** What turning biometric sign-in on needs: the account's password, which is only ever kept behind biometrics. */
export type BiometricSignInInput = { email: string; name: string; password: string };

export type BiometricSignInChange = { ok: true } | { ok: false; reason: "unavailable" | "cancelled" | "failed"; error?: string };

export type BiometricSignInResult =
  | { ok: true; credential: BiometricCredential }
  /** `invalidated`: the phone destroyed the stored password (a face or fingerprint was added), or none was stored. */
  | { ok: false; reason: "cancelled" | "invalidated" | "failed" | "unavailable" };

type AppLockValue = {
  supported: boolean;
  capability: BiometricCapability | null;
  preference: LockPreference;
  locked: boolean;
  /** The account that turned on biometric sign-in on this device; labels the "Face ID · Sara" button. */
  rememberedAccount: RememberedAccount | null;
  setEnabled: (enabled: boolean) => Promise<LockChangeResult>;
  setLockDelay: (delay: LockDelay) => Promise<void>;
  unlock: () => Promise<UnlockResult>;
  /** Face, fingerprint or passcode check that never trips the lock or privacy cover itself. */
  verifyOwner: (promptMessage: string) => Promise<LocalAuthenticationResult>;
  /**
   * Face ID or a fingerprint releases the stored password so the sign-in form can use it. The check counts as this
   * run's unlock, so signing in does not ask again.
   */
  signInWithBiometrics: () => Promise<BiometricSignInResult>;
  /** Locks the account's password behind the phone's biometrics so Face ID or a fingerprint can sign in. */
  enableBiometricSignIn: (input: BiometricSignInInput) => Promise<BiometricSignInChange>;
  disableBiometricSignIn: () => Promise<void>;
  /** After a password change: keeps the stored password current, or drops it if that can't be done. */
  updateBiometricPassword: (email: string, password: string) => Promise<void>;
  /** After a password sign-in: asks, once per account, whether to use Face ID next time. */
  offerBiometricSignIn: (input: BiometricSignInInput) => Promise<void>;
  /**
   * Call just before signing in with a password: the password proves who is there, so the account does not also meet
   * the lock right away. Returns an undo for when the sign-in fails.
   */
  markPasswordSignIn: (email: string) => () => void;
  /** Only succeeds when the phone has no passcode or biometrics left, so no check could ever pass. */
  turnOffWithoutCredential: () => Promise<boolean>;
  refreshCapability: () => Promise<BiometricCapability | null>;
  /** Wrap photo pickers, share sheets and permission requests: Android backgrounds the app while they are open. */
  runWithoutLocking: <T>(task: () => Promise<T>) => Promise<T>;
};

const AppLockContext = createContext<AppLockValue | null>(null);

type AppLockProviderProps = {
  children: ReactNode;
  /** False while the launch splash is on screen, so the system prompt never covers it. */
  canPrompt: boolean;
};

export function AppLockProvider({ children, canPrompt }: AppLockProviderProps) {
  const { session, configured, signOut } = useAuth();
  const toast = useToast();
  const identity = session?.user.id ?? (configured ? null : "demo-user");
  const email = session?.user.email?.toLowerCase();
  // Biometric checks are remembered per email (or the demo identity) for this run only.
  const verificationKey = email ?? identity;
  const [capability, setCapability] = useState<BiometricCapability | null>(null);
  const [preference, setPreference] = useState<LockPreference>(defaultLockPreference);
  const [rememberedAccount, setRememberedAccount] = useState<RememberedAccount | null>(null);
  const [locked, setLocked] = useState(false);
  const [covered, setCovered] = useState(false);
  const [offer, setOffer] = useState<BiometricSignInInput | null>(null);
  const [offerBusy, setOfferBusy] = useState(false);
  const verified = useRef(new Set<string>());
  const authenticating = useRef(false);
  const externalFlows = useRef(0);
  const backgroundedAt = useRef<number | null>(null);
  const leftThroughExternalFlow = useRef(false);

  const refreshCapability = useCallback(async () => {
    if (!appLockSupported) return null;
    try {
      const next = await readBiometricCapability();
      setCapability(next);
      return next;
    } catch {
      setCapability(null);
      return null;
    }
  }, []);

  useEffect(() => {
    void refreshCapability();
    if (appLockSupported) void loadRememberedAccount().then(setRememberedAccount);
  }, [refreshCapability]);

  useEffect(() => {
    setLocked(false);
    backgroundedAt.current = null;
    if (!appLockSupported || !identity || !verificationKey) {
      // Signing out forgets every check, so signing back in with just an email meets the lock again.
      verified.current.clear();
      setPreference(defaultLockPreference);
      return;
    }
    let cancelled = false;
    void loadLockPreference(identity).then((stored) => {
      if (cancelled) return;
      setPreference(stored);
      // Any session that has not passed a biometric check in this run starts locked: a restored session,
      // one that reappears after an offline refresh, or an email-only sign-in to a lock-enabled account.
      if (stored.enabled && !verified.current.has(verificationKey)) setLocked(true);
    });
    return () => {
      cancelled = true;
    };
    // verificationKey changes together with identity.
  }, [identity]);

  const lockEnabled = Boolean(identity) && preference.enabled;
  const { lockAfterMs } = preference;

  useEffect(() => {
    if (!appLockSupported || !lockEnabled) {
      setCovered(false);
      return;
    }
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "inactive") {
        // iOS goes inactive under the Face ID sheet and permission alerts we opened; covering then would flash.
        if (!authenticating.current && externalFlows.current === 0) setCovered(true);
        return;
      }
      if (state === "background") {
        // Always cover and start the clock: a picker or share sheet only earns a bounded grace period.
        setCovered(true);
        if (backgroundedAt.current === null) {
          backgroundedAt.current = Date.now();
          leftThroughExternalFlow.current = authenticating.current || externalFlows.current > 0;
        }
        return;
      }
      setCovered(false);
      const since = backgroundedAt.current;
      backgroundedAt.current = null;
      if (since === null) return;
      if (shouldLockOnResume(since, Date.now(), resumeAllowance(lockAfterMs, leftThroughExternalFlow.current))) setLocked(true);
    });
    return () => subscription.remove();
  }, [lockAfterMs, lockEnabled]);

  const verifyOwner = useCallback(async (promptMessage: string): Promise<LocalAuthenticationResult> => {
    if (!appLockSupported) return { success: false, error: "not_available" };
    if (authenticating.current) return { success: false, error: "app_cancel" };
    authenticating.current = true;
    try {
      return await authenticateOwner(promptMessage);
    } finally {
      authenticating.current = false;
    }
  }, []);

  const markVerified = useCallback((key: string | null | undefined) => {
    if (key) verified.current.add(key);
  }, []);

  const markPasswordSignIn = useCallback((email: string) => {
    const key = email.trim().toLowerCase();
    const alreadyVerified = verified.current.has(key);
    verified.current.add(key);
    return () => {
      if (!alreadyVerified) verified.current.delete(key);
    };
  }, []);

  const forgetBiometricSignIn = useCallback(async () => {
    await clearBiometricCredential();
    await saveRememberedAccount(null);
    setRememberedAccount(null);
  }, []);

  const signInWithBiometrics = useCallback(async (): Promise<BiometricSignInResult> => {
    if (!appLockSupported) return { ok: false, reason: "unavailable" };
    if (authenticating.current) return { ok: false, reason: "cancelled" };
    authenticating.current = true;
    try {
      const result = await readBiometricCredential("Sign in to LenaDena");
      if (result.ok) {
        markVerified(result.credential.email.toLowerCase());
        return { ok: true, credential: result.credential };
      }
      if (result.reason === "invalidated" || result.reason === "missing") {
        await forgetBiometricSignIn();
        return { ok: false, reason: "invalidated" };
      }
      return { ok: false, reason: result.reason };
    } finally {
      authenticating.current = false;
    }
  }, [forgetBiometricSignIn, markVerified]);

  const enableBiometricSignIn = useCallback(async ({ email, name, password }: BiometricSignInInput): Promise<BiometricSignInChange> => {
    if (!appLockSupported) return { ok: false, reason: "unavailable" };
    const current = await refreshCapability();
    if (!current?.available) return { ok: false, reason: "unavailable" };
    authenticating.current = true;
    try {
      const saved = await saveBiometricCredential({ email, password }, `Turn on ${current.label} sign-in for LenaDena`);
      if (!saved.ok) return { ok: false, reason: saved.cancelled ? "cancelled" : "failed", error: saved.error };
      const account = { email: email.trim().toLowerCase(), name: name.trim() || email.split("@")[0] || email };
      await saveRememberedAccount(account);
      setRememberedAccount(account);
      return { ok: true };
    } finally {
      authenticating.current = false;
    }
  }, [refreshCapability]);

  const disableBiometricSignIn = forgetBiometricSignIn;

  const updateBiometricPassword = useCallback(async (email: string, password: string) => {
    if (!rememberedAccount || rememberedAccount.email.toLowerCase() !== email.trim().toLowerCase()) return;
    authenticating.current = true;
    try {
      const saved = await saveBiometricCredential({ email, password }, "Update your LenaDena sign-in");
      // A stored password that no longer works would only fail later; better to sign in with the password once.
      if (!saved.ok) await forgetBiometricSignIn();
    } finally {
      authenticating.current = false;
    }
  }, [forgetBiometricSignIn, rememberedAccount]);

  const offerBiometricSignIn = useCallback(async (input: BiometricSignInInput) => {
    if (!appLockSupported) return;
    const current = capability ?? await refreshCapability();
    if (!current?.available) return;
    if (rememberedAccount?.email.toLowerCase() === input.email.trim().toLowerCase()) return;
    if (await wasBiometricOfferDismissed(input.email)) return;
    setOffer(input);
  }, [capability, refreshCapability, rememberedAccount]);

  const unlock = useCallback(async (): Promise<UnlockResult> => {
    try {
      const result = await verifyOwner("Unlock LenaDena");
      if (!result.success) return { ok: false, error: result.error };
      markVerified(verificationKey);
      backgroundedAt.current = null;
      setLocked(false);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "unknown" };
    }
  }, [markVerified, verificationKey, verifyOwner]);

  const disableLock = useCallback(async () => {
    if (!identity) return;
    const next = { ...preference, enabled: false };
    await saveLockPreference(identity, next);
    setPreference(next);
  }, [identity, preference]);

  const turnOffWithoutCredential = useCallback(async () => {
    if (!identity || !appLockSupported) return false;
    try {
      if (await hasDeviceCredential()) return false;
    } catch {
      return false;
    }
    await disableLock();
    setLocked(false);
    return true;
  }, [disableLock, identity]);

  const setEnabled = useCallback(async (enabled: boolean): Promise<LockChangeResult> => {
    if (!appLockSupported || !identity) return { ok: false, reason: "unavailable" };
    const current = enabled ? await refreshCapability() : capability;
    if (enabled && !current?.available) return { ok: false, reason: "unavailable" };
    const label = current?.label ?? "app lock";
    // Turning the lock off also needs the owner, so an unlocked phone cannot silently remove it.
    const result = await verifyOwner(enabled ? `Turn on ${label} for LenaDena` : `Turn off ${label} for LenaDena`);
    if (!result.success) {
      // A phone whose passcode was removed can never pass the check; let its owner switch the lock off.
      if (!enabled && isMissingDeviceCredential(result.error) && await turnOffWithoutCredential()) return { ok: true };
      return { ok: false, reason: isCancelledAuthentication(result.error) ? "cancelled" : "failed", error: result.error };
    }
    markVerified(verificationKey);
    if (!enabled) {
      await disableLock();
      return { ok: true };
    }
    const next = { ...preference, enabled: true };
    await saveLockPreference(identity, next);
    setPreference(next);
    return { ok: true };
  }, [capability, disableLock, identity, markVerified, preference, refreshCapability, turnOffWithoutCredential, verificationKey, verifyOwner]);

  const setLockDelay = useCallback(async (delay: LockDelay) => {
    if (!identity) return;
    const next = { ...preference, lockAfterMs: delay };
    setPreference(next);
    await saveLockPreference(identity, next);
  }, [identity, preference]);

  const runWithoutLocking = useCallback(async <T,>(task: () => Promise<T>) => {
    externalFlows.current += 1;
    try {
      return await task();
    } finally {
      // Android can report leaving the app just after a share sheet or picker promise settles.
      setTimeout(() => {
        externalFlows.current = Math.max(0, externalFlows.current - 1);
      }, 1500);
    }
  }, []);

  const value = useMemo<AppLockValue>(() => ({
    supported: appLockSupported,
    capability,
    preference,
    locked,
    rememberedAccount,
    setEnabled,
    setLockDelay,
    unlock,
    verifyOwner,
    signInWithBiometrics,
    enableBiometricSignIn,
    disableBiometricSignIn,
    updateBiometricPassword,
    offerBiometricSignIn,
    markPasswordSignIn,
    turnOffWithoutCredential,
    refreshCapability,
    runWithoutLocking,
  }), [capability, disableBiometricSignIn, enableBiometricSignIn, locked, markPasswordSignIn, offerBiometricSignIn, preference, refreshCapability, rememberedAccount, runWithoutLocking, setEnabled, setLockDelay, signInWithBiometrics, turnOffWithoutCredential, unlock, updateBiometricPassword, verifyOwner]);

  const showLock = locked && Boolean(identity);

  const { setObscured } = toast;

  useEffect(() => {
    // Toasts can carry names and amounts; keep them off the lock screen and out of the app-switcher snapshot.
    setObscured({ locked: showLock, covered });
  }, [covered, setObscured, showLock]);

  useEffect(() => {
    if (!showLock) return;
    // The keyboard lives in its own window above the lock and returns for a still-focused field on resume.
    Keyboard.dismiss();
    // Android back would otherwise navigate the hidden screens underneath the lock.
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => subscription.remove();
  }, [showLock]);

  const offerLabel = capability?.label ?? "Face ID";

  const acceptOffer = useCallback(async () => {
    if (!offer || offerBusy) return;
    setOfferBusy(true);
    try {
      const result = await enableBiometricSignIn(offer);
      if (result.ok) {
        toast.success(`${offerLabel} sign-in is on`, "Next time, tap the button instead of typing your password.");
      } else if (result.reason === "failed") {
        toast.warning(`Couldn't turn on ${offerLabel}`, "You can try again in Settings.");
      }
    } finally {
      // The password is only needed for this one save; drop it from memory either way.
      setOffer(null);
      setOfferBusy(false);
    }
  }, [enableBiometricSignIn, offer, offerBusy, offerLabel, toast]);

  const dismissOffer = useCallback(() => {
    if (offerBusy) return;
    if (offer) void rememberBiometricOfferDismissed(offer.email);
    setOffer(null);
  }, [offer, offerBusy]);

  const signOutFromLock = useCallback(async () => {
    await signOut();
    goToSignIn();
  }, [signOut]);

  return (
    <AppLockContext.Provider value={value}>
      <ScreenObscuredContext.Provider value={showLock}>
        {createElement(
          View,
          {
            style: styles.fill,
            // Keep screen readers out of the balances hidden behind the lock.
            accessibilityElementsHidden: showLock,
            importantForAccessibility: showLock ? "no-hide-descendants" : "auto",
          },
          children,
        )}
        {showLock ? (
          <LockScreen
            capability={capability}
            canPrompt={canPrompt}
            onUnlock={unlock}
            onTurnOff={turnOffWithoutCredential}
            onSignOut={configured ? signOutFromLock : undefined}
          />
        ) : covered ? <PrivacyCover /> : null}
        <ConfirmModal
          visible={Boolean(offer) && !showLock}
          icon={capability?.kind === "face" ? "face-id" : "finger-print"}
          title={`Sign in with ${offerLabel} next time?`}
          detail={`Skip typing your password: LenaDena checks it's you with your ${capability?.kind === "face" ? "face" : "fingerprint"}. Your password stays locked in your phone's secure storage, and you can turn this off in Settings.`}
          confirmLabel={`Use ${offerLabel}`}
          cancelLabel="Not now"
          loading={offerBusy}
          onConfirm={() => void acceptOffer()}
          onClose={dismissOffer}
        />
      </ScreenObscuredContext.Provider>
    </AppLockContext.Provider>
  );
}

export function useAppLock() {
  const value = useContext(AppLockContext);
  if (!value) throw new Error("useAppLock must be used inside AppLockProvider");
  return value;
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
