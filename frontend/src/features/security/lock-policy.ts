// Pure app-lock rules, kept free of native imports so they can be unit tested.

/** Mirrors `AuthenticationType` from expo-local-authentication. */
export const AuthenticationKind = {
  fingerprint: 1,
  facialRecognition: 2,
  iris: 3,
} as const;

export type BiometricKind = "face" | "fingerprint" | "face-or-fingerprint" | "iris" | "biometric";

export const LOCK_DELAYS = [0, 60_000, 300_000] as const;
export type LockDelay = (typeof LOCK_DELAYS)[number];

export type LockPreference = {
  enabled: boolean;
  lockAfterMs: LockDelay;
};

export const defaultLockPreference: LockPreference = { enabled: false, lockAfterMs: 0 };

/** Uses the platform's own names: Face ID and Touch ID on iOS, face unlock and fingerprint on Android. */
export function describeBiometrics(platform: string, types: readonly number[]): { kind: BiometricKind; label: string } {
  const face = types.includes(AuthenticationKind.facialRecognition);
  const fingerprint = types.includes(AuthenticationKind.fingerprint);
  if (platform === "ios") {
    if (face) return { kind: "face", label: "Face ID" };
    if (fingerprint) return { kind: "fingerprint", label: "Touch ID" };
    return { kind: "biometric", label: "Biometrics" };
  }
  if (face && fingerprint) return { kind: "face-or-fingerprint", label: "Face or fingerprint" };
  if (fingerprint) return { kind: "fingerprint", label: "Fingerprint" };
  if (face) return { kind: "face", label: "Face unlock" };
  if (types.includes(AuthenticationKind.iris)) return { kind: "iris", label: "Iris unlock" };
  return { kind: "biometric", label: "Biometrics" };
}

/** A clock moved backwards while away counts as a reason to lock, never as a way around it. */
export function shouldLockOnResume(backgroundedAt: number, now: number, lockAfterMs: number) {
  const elapsed = now - backgroundedAt;
  return elapsed < 0 || elapsed >= lockAfterMs;
}

/**
 * Leaving through something LenaDena opened (photo picker, share sheet, permission dialog, the passcode
 * screen of a biometric prompt) gets a bounded grace period instead of an immediate lock, so returning
 * from it does not demand Face ID again, while staying away longer still locks.
 */
export const EXTERNAL_FLOW_GRACE_MS = 3 * 60_000;

export function resumeAllowance(lockAfterMs: number, leftThroughExternalFlow: boolean) {
  return leftThroughExternalFlow ? Math.max(lockAfterMs, EXTERNAL_FLOW_GRACE_MS) : lockAfterMs;
}

/** The phone no longer has a passcode or enrolled biometrics, so no check can ever succeed. */
export function isMissingDeviceCredential(error: string | undefined) {
  return error === "passcode_not_set" || error === "not_enrolled" || error === "not_available";
}

export function lockDelayLabel(delay: LockDelay) {
  if (delay === 0) return "Immediately";
  return `After ${delay / 60_000} min`;
}

export function isLockDelay(value: unknown): value is LockDelay {
  return LOCK_DELAYS.includes(value as LockDelay);
}

export function parseLockPreference(raw: string | null): LockPreference {
  if (!raw) return defaultLockPreference;
  try {
    const value = JSON.parse(raw) as Partial<LockPreference>;
    return {
      enabled: value.enabled === true,
      lockAfterMs: isLockDelay(value.lockAfterMs) ? value.lockAfterMs : defaultLockPreference.lockAfterMs,
    };
  } catch {
    return defaultLockPreference;
  }
}

/** The account that turned on biometric unlock on this device, offered as a biometric sign-in shortcut. */
export type RememberedAccount = {
  email: string;
  name: string;
};

export const rememberedAccountKey = "lenadena.biometric-account.v1";

export function parseRememberedAccount(raw: string | null): RememberedAccount | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<RememberedAccount>;
    if (typeof value.email !== "string" || !value.email.includes("@")) return null;
    return { email: value.email, name: typeof value.name === "string" && value.name.trim() ? value.name.trim() : value.email.split("@")[0] ?? "" };
  } catch {
    return null;
  }
}

/** SecureStore keys allow only letters, digits, ".", "-" and "_". */
export function lockPreferenceKey(identity: string) {
  return `lenadena.applock.v1.${identity.replace(/[^A-Za-z0-9._-]/g, "_")}`;
}

/** Cancels are the person's choice and need no message; everything else deserves an explanation. */
export function isCancelledAuthentication(error: string | undefined) {
  return error === "user_cancel" || error === "system_cancel" || error === "app_cancel";
}

export function authenticationFailureMessage(error: string | undefined, label: string): { title: string; message: string; tone: "warning" | "error" } {
  switch (error) {
    case "lockout":
      return { title: `${label} is paused`, message: "Too many attempts. Unlock your phone with its passcode, then try again.", tone: "warning" };
    case "not_enrolled":
    case "not_available":
      return { title: `${label} isn't set up`, message: `Add ${label} or a passcode in your phone settings first.`, tone: "warning" };
    case "passcode_not_set":
      return { title: "Set a phone passcode", message: "Biometric unlock needs a passcode on this device.", tone: "warning" };
    case "authentication_failed":
      return { title: "Couldn't verify it's you", message: "Try again.", tone: "error" };
    default:
      return { title: "Verification didn't finish", message: "Try again.", tone: "error" };
  }
}
