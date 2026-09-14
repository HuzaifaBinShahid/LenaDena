import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import {
  describeBiometrics,
  lockPreferenceKey,
  parseLockPreference,
  parseRememberedAccount,
  rememberedAccountKey,
  type BiometricKind,
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
