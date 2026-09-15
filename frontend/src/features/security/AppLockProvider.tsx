import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AppState, BackHandler, Keyboard, StyleSheet, View } from "react-native";
import type { LocalAuthenticationResult } from "expo-local-authentication";
import { ScreenObscuredContext } from "@/components/ui/ScreenObscured";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/features/auth/AuthProvider";
import { goToSignIn } from "@/features/auth/navigation";
import { useLedger } from "@/features/ledger/LedgerProvider";
import {
  appLockSupported,
  authenticateOwner,
  hasDeviceCredential,
  loadLockPreference,
  loadRememberedAccount,
  readBiometricCapability,
  saveLockPreference,
  saveRememberedAccount,
  type BiometricCapability,
} from "@/features/security/biometrics";
import {
  defaultLockPreference,
  isCancelledAuthentication,
  isMissingDeviceCredential,
  resumeAllowance,
  shouldLockOnResume,
  type LockDelay,
  type LockPreference,
  type RememberedAccount,
} from "@/features/security/lock-policy";
import { LockScreen, PrivacyCover } from "@/features/security/LockScreen";

export type LockChangeResult =
  | { ok: true }
  | { ok: false; reason: "unavailable" | "cancelled" | "failed"; error?: string };

export type UnlockResult = { ok: true } | { ok: false; error: string };

type AppLockValue = {
  supported: boolean;
  capability: BiometricCapability | null;
  preference: LockPreference;
  locked: boolean;
  /** The account that turned on biometric unlock on this device; powers biometric sign-in. */
  rememberedAccount: RememberedAccount | null;
  setEnabled: (enabled: boolean) => Promise<LockChangeResult>;
  setLockDelay: (delay: LockDelay) => Promise<void>;
  unlock: () => Promise<UnlockResult>;
  /** Face, fingerprint or passcode check that never trips the lock or privacy cover itself. */
  verifyOwner: (promptMessage: string) => Promise<LocalAuthenticationResult>;
  /** Checks the owner before a biometric sign-in and remembers the check, so that sign-in does not lock again. */
  verifyForSignIn: (account: RememberedAccount) => Promise<LocalAuthenticationResult>;
  /** Only succeeds when the phone has no passcode or biometrics left, so no check could ever pass. */
  turnOffWithoutCredential: () => Promise<boolean>;
  forgetRememberedAccount: () => Promise<void>;
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
  const { plan } = useLedger();
  const identity = session?.user.id ?? (configured ? null : "demo-user");
  const email = session?.user.email?.toLowerCase();
  // Biometric checks are remembered per email (or the demo identity) for this run only.
  const verificationKey = email ?? identity;
  const [capability, setCapability] = useState<BiometricCapability | null>(null);
  const [preference, setPreference] = useState<LockPreference>(defaultLockPreference);
  const [rememberedAccount, setRememberedAccount] = useState<RememberedAccount | null>(null);
  const [locked, setLocked] = useState(false);
  const [covered, setCovered] = useState(false);
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

  const verifyForSignIn = useCallback(async (account: RememberedAccount) => {
    const result = await verifyOwner(`Sign in to LenaDena as ${account.name.split(/\s+/)[0] ?? account.name}`);
    if (result.success) markVerified(account.email.toLowerCase());
    return result;
  }, [markVerified, verifyOwner]);

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
    await saveRememberedAccount(null);
    setRememberedAccount(null);
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
    const account = session?.user.email ? { email: session.user.email, name: plan.user.name } : null;
    await saveRememberedAccount(account);
    setRememberedAccount(account);
    return { ok: true };
  }, [capability, disableLock, identity, markVerified, plan.user.name, preference, refreshCapability, session?.user.email, turnOffWithoutCredential, verificationKey, verifyOwner]);

  const setLockDelay = useCallback(async (delay: LockDelay) => {
    if (!identity) return;
    const next = { ...preference, lockAfterMs: delay };
    setPreference(next);
    await saveLockPreference(identity, next);
  }, [identity, preference]);

  const forgetRememberedAccount = useCallback(async () => {
    await saveRememberedAccount(null);
    setRememberedAccount(null);
  }, []);

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
    verifyForSignIn,
    turnOffWithoutCredential,
    forgetRememberedAccount,
    refreshCapability,
    runWithoutLocking,
  }), [capability, forgetRememberedAccount, locked, preference, refreshCapability, rememberedAccount, runWithoutLocking, setEnabled, setLockDelay, turnOffWithoutCredential, unlock, verifyForSignIn, verifyOwner]);

  const showLock = locked && Boolean(identity);

  const { setObscured } = useToast();

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
