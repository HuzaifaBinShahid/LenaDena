import { describe, expect, it } from "vitest";
import {
  authenticationFailureMessage,
  AuthenticationKind,
  defaultLockPreference,
  describeBiometrics,
  EXTERNAL_FLOW_GRACE_MS,
  isCancelledAuthentication,
  isMissingDeviceCredential,
  resumeAllowance,
  lockDelayLabel,
  lockPreferenceKey,
  parseLockPreference,
  parseRememberedAccount,
  shouldLockOnResume,
} from "./lock-policy";

describe("describeBiometrics", () => {
  it("uses Apple names on iOS", () => {
    expect(describeBiometrics("ios", [AuthenticationKind.facialRecognition])).toEqual({ kind: "face", label: "Face ID" });
    expect(describeBiometrics("ios", [AuthenticationKind.fingerprint])).toEqual({ kind: "fingerprint", label: "Touch ID" });
  });

  it("covers face and fingerprint combinations on Android", () => {
    expect(describeBiometrics("android", [AuthenticationKind.fingerprint, AuthenticationKind.facialRecognition]).label).toBe("Face or fingerprint");
    expect(describeBiometrics("android", [AuthenticationKind.facialRecognition]).label).toBe("Face unlock");
    expect(describeBiometrics("android", [AuthenticationKind.fingerprint]).label).toBe("Fingerprint");
    expect(describeBiometrics("android", []).label).toBe("Biometrics");
  });
});

describe("lock timing", () => {
  it("locks immediately or after the chosen background delay", () => {
    expect(shouldLockOnResume(1_000, 1_000, 0)).toBe(true);
    expect(shouldLockOnResume(0, 59_999, 60_000)).toBe(false);
    expect(shouldLockOnResume(0, 60_000, 60_000)).toBe(true);
    expect(lockDelayLabel(0)).toBe("Immediately");
    expect(lockDelayLabel(300_000)).toBe("After 5 min");
  });

  it("locks when the clock moved backwards while away", () => {
    expect(shouldLockOnResume(10_000, 5_000, 300_000)).toBe(true);
  });

  it("gives flows the app opened a bounded grace period", () => {
    expect(resumeAllowance(0, false)).toBe(0);
    expect(resumeAllowance(0, true)).toBe(EXTERNAL_FLOW_GRACE_MS);
    expect(resumeAllowance(600_000, true)).toBe(600_000);
    // Ten minutes in WhatsApp after sharing an invite still locks.
    expect(shouldLockOnResume(0, 10 * 60_000, resumeAllowance(0, true))).toBe(true);
    expect(shouldLockOnResume(0, 40_000, resumeAllowance(0, true))).toBe(false);
  });

  it("recognises a phone with no credential left", () => {
    expect(isMissingDeviceCredential("passcode_not_set")).toBe(true);
    expect(isMissingDeviceCredential("not_enrolled")).toBe(true);
    expect(isMissingDeviceCredential("user_cancel")).toBe(false);
  });
});

describe("stored lock preference", () => {
  it("falls back safely for missing, corrupt or unexpected values", () => {
    expect(parseLockPreference(null)).toEqual(defaultLockPreference);
    expect(parseLockPreference("{not json")).toEqual(defaultLockPreference);
    expect(parseLockPreference(JSON.stringify({ enabled: "yes", lockAfterMs: 12 }))).toEqual(defaultLockPreference);
    expect(parseLockPreference(JSON.stringify({ enabled: true, lockAfterMs: 60_000 }))).toEqual({ enabled: true, lockAfterMs: 60_000 });
  });

  it("builds SecureStore-safe keys per account", () => {
    expect(lockPreferenceKey("8f14e45f-ceea-467a-9b36-5a3b1c6f2d10")).toBe("lenadena.applock.v1.8f14e45f-ceea-467a-9b36-5a3b1c6f2d10");
    expect(lockPreferenceKey("demo user@x")).toBe("lenadena.applock.v1.demo_user_x");
  });

  it("treats only deliberate dismissals as silent", () => {
    expect(isCancelledAuthentication("user_cancel")).toBe(true);
    expect(isCancelledAuthentication("lockout")).toBe(false);
  });

  it("only remembers a well-formed biometric sign-in account", () => {
    expect(parseRememberedAccount(null)).toBeNull();
    expect(parseRememberedAccount("oops")).toBeNull();
    expect(parseRememberedAccount(JSON.stringify({ email: "no-at-sign" }))).toBeNull();
    expect(parseRememberedAccount(JSON.stringify({ email: "sara@example.com", name: "  Sara Ali " }))).toEqual({ email: "sara@example.com", name: "Sara Ali" });
    expect(parseRememberedAccount(JSON.stringify({ email: "sara@example.com" }))).toEqual({ email: "sara@example.com", name: "sara" });
  });

  it("explains failures in the platform's own words", () => {
    expect(authenticationFailureMessage("lockout", "Face ID")).toMatchObject({ title: "Face ID is paused", tone: "warning" });
    expect(authenticationFailureMessage("not_enrolled", "Fingerprint").title).toBe("Fingerprint isn't set up");
    expect(authenticationFailureMessage("something new", "Touch ID").tone).toBe("error");
  });
});
