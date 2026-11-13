import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import {
  biometricCredentialKey,
  biometricCredentialModeKey,
  biometricOfferDismissedKey,
  describeBiometrics,
  isCancelledAuthentication,
  isCancelledSecureStoreError,
  lockPreferenceKey,
  parseCredential,
  parseCredentialProtection,
  parseLockPreference,
  parseRememberedAccount,
  rememberedAccountKey,
  serializeCredential,
  type BiometricCredential,
  type BiometricKind,
  type CredentialProtection,
  type LockPreference,
  type RememberedAccount,
} from "@/features/security/lock-policy";

export type BiometricCapability = {
  /** Hardware present and at least one face or fingerprint enrolled. */
  available: boolean;
  hasHardware: boolean;
  enrolled: boolean;
  kind: BiometricKind;
  label: string;
  /** Expo Go on iOS lacks NSFaceIDUsageDescription, so iOS asks for the passcode instead of Face ID. */
  faceIdNeedsDevelopmentBuild: boolean;
};

export const appLockSupported = Platform.OS === "ios" || Platform.OS === "android";

export async function readBiometricCapability(): Promise<BiometricCapability> {
  const [hasHardware, enrolled, types] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);
  const { kind, label } = describeBiometrics(Platform.OS, types);
  return {
    available: hasHardware && enrolled,
    hasHardware,
    enrolled,
    kind,
    label,
    faceIdNeedsDevelopmentBuild: Platform.OS === "ios" && kind === "face" && Constants.executionEnvironment === ExecutionEnvironment.StoreClient,
  };
}

/** True while the phone still has a passcode, PIN or enrolled biometrics that a check could use. */
export async function hasDeviceCredential() {
  return (await LocalAuthentication.getEnrolledLevelAsync()) !== LocalAuthentication.SecurityLevel.NONE;
}

/** Face, fingerprint, or the device passcode as the system fallback after failed attempts. */
export function authenticateOwner(promptMessage: string) {
  return LocalAuthentication.authenticateAsync({
    promptMessage,
    cancelLabel: "Cancel",
    fallbackLabel: "Use passcode",
    disableDeviceFallback: false,
    requireConfirmation: false,
  });
}

export async function loadLockPreference(identity: string): Promise<LockPreference> {
  try {
    return parseLockPreference(await SecureStore.getItemAsync(lockPreferenceKey(identity)));
  } catch {
    return parseLockPreference(null);
  }
}

export async function saveLockPreference(identity: string, preference: LockPreference) {
  await SecureStore.setItemAsync(lockPreferenceKey(identity), JSON.stringify(preference));
}

export async function loadRememberedAccount(): Promise<RememberedAccount | null> {
  try {
    return parseRememberedAccount(await SecureStore.getItemAsync(rememberedAccountKey));
  } catch {
    return null;
  }
}

export async function saveRememberedAccount(account: RememberedAccount | null) {
  if (account) await SecureStore.setItemAsync(rememberedAccountKey, JSON.stringify(account));
  else await SecureStore.deleteItemAsync(rememberedAccountKey);
}

// --- Biometric sign-in credential --------------------------------------------------------------------------------

export type CredentialSaveResult = { ok: true; protection: CredentialProtection } | { ok: false; cancelled: boolean; error: string };

export type CredentialReadResult =
  | { ok: true; credential: BiometricCredential }
  /**
   * `missing`: nothing stored. `invalidated`: the phone destroyed it because a face or fingerprint was added or the
   * passcode removed, so the person must sign in with their password once. `cancelled`: they dismissed the prompt.
   */
  | { ok: false; reason: "missing" | "invalidated" | "cancelled" | "failed"; error?: string };

const secureOptions = { keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY } as const;

function describeError(error: unknown) {
  return error instanceof Error && error.message ? error.message : "unknown";
}

/**
 * Locks the password behind the phone's biometrics. When the secure store can bind a value to a face or fingerprint
 * (`canUseBiometricAuthentication`) it does, and the system releases it only after a successful check. Some Android
 * phones rate their face unlock as too weak for that: the value then sits in the encrypted store and every read is
 * preceded by LenaDena's own biometric check, so it works for them too, with a weaker guarantee.
 */
export async function saveBiometricCredential(credential: BiometricCredential, promptMessage: string): Promise<CredentialSaveResult> {
  const protection: CredentialProtection = SecureStore.canUseBiometricAuthentication() ? "hardware" : "gated";
  try {
    await SecureStore.setItemAsync(
      biometricCredentialKey,
      serializeCredential(credential),
      protection === "hardware" ? { ...secureOptions, requireAuthentication: true, authenticationPrompt: promptMessage } : secureOptions,
    );
    await SecureStore.setItemAsync(biometricCredentialModeKey, protection);
    return { ok: true, protection };
  } catch (error) {
    const cancelled = isCancelledSecureStoreError(error);
    // Backing out of the prompt leaves whatever was stored as it was; only a real failure clears it.
    if (!cancelled) await clearBiometricCredential();
    return { ok: false, cancelled, error: describeError(error) };
  }
}

export async function readBiometricCredential(promptMessage: string): Promise<CredentialReadResult> {
  let protection: CredentialProtection | null;
  try {
    protection = parseCredentialProtection(await SecureStore.getItemAsync(biometricCredentialModeKey));
  } catch {
    return { ok: false, reason: "failed" };
  }
  if (!protection) return { ok: false, reason: "missing" };
  try {
    if (protection === "gated") {
      const check = await authenticateOwner(promptMessage);
      if (!check.success) return { ok: false, reason: isCancelledAuthentication(check.error) ? "cancelled" : "failed", error: check.error };
    }
    const raw = await SecureStore.getItemAsync(
      biometricCredentialKey,
      protection === "hardware" ? { requireAuthentication: true, authenticationPrompt: promptMessage } : undefined,
    );
    // The secure store answers null for a value it no longer has and for one the system invalidated.
    if (raw === null) return { ok: false, reason: protection === "hardware" ? "invalidated" : "missing" };
    const credential = parseCredential(raw);
    return credential ? { ok: true, credential } : { ok: false, reason: "invalidated" };
  } catch (error) {
    return { ok: false, reason: isCancelledSecureStoreError(error) ? "cancelled" : "failed", error: describeError(error) };
  }
}

export async function clearBiometricCredential() {
  for (const key of [biometricCredentialKey, biometricCredentialModeKey]) {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Nothing stored under that key, or the store is unavailable: either way there is nothing left to protect.
    }
  }
}

export async function wasBiometricOfferDismissed(email: string) {
  try {
    return (await SecureStore.getItemAsync(biometricOfferDismissedKey(email))) === "1";
  } catch {
    return false;
  }
}

export async function rememberBiometricOfferDismissed(email: string) {
  try {
    await SecureStore.setItemAsync(biometricOfferDismissedKey(email), "1");
  } catch {
    // Asking once more next time is harmless.
  }
}
