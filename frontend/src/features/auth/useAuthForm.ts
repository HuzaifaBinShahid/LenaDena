import { useCallback, useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import type { Session } from "@supabase/supabase-js";
import { useToast } from "@/components/ui/Toast";
import type { IconName } from "@/components/ui/Icon";
import { useAuth } from "@/features/auth/AuthProvider";
import { describeAuthError } from "@/features/auth/authErrors";
import { authReturnPath } from "@/features/auth/authLinks";
import { PASSWORD_HINT, passwordError, passwordStrength, type PasswordStrength } from "@/features/auth/password";
import { useAppLock } from "@/features/security/AppLockProvider";

// Mirrors the API's email format check so an address is never accepted here and rejected there.
const emailPattern = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
export const NAME_MAX_LENGTH = 80;
export const EMAIL_MAX_LENGTH = 254;
/** Supabase answers 429 when the same address is emailed twice within a minute. */
const RESEND_COOLDOWN_SECONDS = 60;

export type AuthMode = "signup" | "signin" | "forgot";

/** The screen shows one of these instead of the form once an email is on its way. */
export type AuthNotice =
  | { kind: "confirm_email"; email: string }
  | { kind: "reset_sent"; email: string };

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? "";
}

function nameOf(session: Session, email: string) {
  const metadata = session.user.user_metadata as { name?: unknown } | null;
  const fromProfile = typeof metadata?.name === "string" ? metadata.name.trim() : "";
  return fromProfile || email.split("@")[0] || email;
}

export type AuthForm = ReturnType<typeof useAuthForm>;

export function useAuthForm(next: string | undefined) {
  const { configured, signUp, signIn, requestPasswordReset, resendConfirmation } = useAuth();
  const { capability, rememberedAccount, signInWithBiometrics, disableBiometricSignIn, offerBiometricSignIn, markPasswordSignIn } = useAppLock();
  const toast = useToast();
  const [mode, setMode] = useState<AuthMode>("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [notice, setNotice] = useState<AuthNotice | null>(null);
  const [loading, setLoading] = useState<"form" | "biometric" | "resend" | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const modeChosen = useRef(false);
  const returnPath = authReturnPath(next);

  const emailValid = email.trim().length <= EMAIL_MAX_LENGTH && emailPattern.test(email.trim());
  const nameValid = mode !== "signup" || (name.trim().length > 0 && name.trim().length <= NAME_MAX_LENGTH);
  // Signing in only needs *a* password: the rules apply to a new one, and an older account may predate them.
  const passwordProblem = mode === "signup" ? passwordError(password) : password.length === 0 ? "Enter your password." : undefined;

  // Someone who turned on biometric sign-in here is returning, so start on sign in.
  // The email is deliberately not prefilled: the password stays behind the biometric button, not in a field.
  useEffect(() => {
    if (rememberedAccount && !modeChosen.current) setMode("signin");
  }, [rememberedAccount]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const switchMode = useCallback((nextMode: AuthMode) => {
    modeChosen.current = true;
    setMode(nextMode);
    setSubmitted(false);
    setNotice(null);
    setShowPassword(false);
  }, []);

  const showConfirmEmail = useCallback((address: string) => {
    setNotice({ kind: "confirm_email", email: address });
    setResendIn(RESEND_COOLDOWN_SECONDS);
  }, []);

  const demoNotice = useCallback(() => {
    toast.info("Demo mode", "Supabase isn't configured, so LenaDena opens the demo account.");
    router.replace("/");
  }, [toast]);

  const welcome = useCallback((session: Session, address: string, created: boolean) => {
    const display = nameOf(session, address);
    toast.success(
      created ? `Welcome to LenaDena, ${firstName(display)}` : `Welcome back, ${firstName(display)}`,
      created ? "Your account is ready. Add your first balance whenever you like." : undefined,
    );
    return display;
  }, [toast]);

  const submit = async () => {
    setSubmitted(true);
    if (!emailValid) return;
    if (mode === "forgot") return sendReset();
    if (!nameValid || passwordProblem) return;
    if (!configured) return demoNotice();
    setLoading("form");
    // The password proves who is here, so the app lock does not also meet this person on the way in.
    const undoVerified = mode === "signin" ? markPasswordSignIn(email) : () => undefined;
    try {
      if (mode === "signup") {
        const result = await signUp({ email, password, name, returnPath });
        if (result.kind === "confirm_email") {
          showConfirmEmail(result.email);
          return;
        }
        toast.success(`Welcome to LenaDena, ${firstName(name)}`, "Your account is ready. Add your first balance whenever you like.");
        void offerBiometricSignIn({ email, name: name.trim(), password });
        return;
      }
      const session = await signIn({ email, password });
      const display = welcome(session, email.trim().toLowerCase(), false);
      void offerBiometricSignIn({ email, name: display, password });
    } catch (error) {
      undoVerified();
      const copy = describeAuthError(error, mode === "signup" ? "sign_up" : "sign_in");
      if (copy.kind === "email_not_confirmed") {
        showConfirmEmail(email.trim().toLowerCase());
        return;
      }
      if (copy.kind === "user_exists") switchMode("signin");
      toast.error(copy.title, copy.message);
    } finally {
      setLoading(null);
    }
  };

  const sendReset = async () => {
    if (!configured) return demoNotice();
    setLoading("form");
    try {
      await requestPasswordReset(email);
      setNotice({ kind: "reset_sent", email: email.trim().toLowerCase() });
      setResendIn(RESEND_COOLDOWN_SECONDS);
    } catch (error) {
      const copy = describeAuthError(error, "reset");
      // Supabase only rate-limits an address that has an account. Answering "too many attempts" would tell anyone
      // which addresses do, so a limit looks exactly like success.
      if (copy.kind === "rate_limited") {
        setNotice({ kind: "reset_sent", email: email.trim().toLowerCase() });
        setResendIn(RESEND_COOLDOWN_SECONDS);
      } else {
        toast.error(copy.title, copy.message);
      }
    } finally {
      setLoading(null);
    }
  };

  /** Sends the confirmation or reset email again for whichever notice is showing. */
  const resend = async () => {
    if (!notice || resendIn > 0 || loading) return;
    setLoading("resend");
    try {
      if (notice.kind === "confirm_email") await resendConfirmation(notice.email);
      else await requestPasswordReset(notice.email);
      setResendIn(RESEND_COOLDOWN_SECONDS);
      toast.success("Sent again", `Check ${notice.email}, including your spam folder.`);
    } catch (error) {
      const copy = describeAuthError(error, "resend");
      if (copy.kind === "rate_limited") setResendIn(RESEND_COOLDOWN_SECONDS);
      toast.error(copy.title, copy.message);
    } finally {
      setLoading(null);
    }
  };

  const biometricLabel = capability?.label ?? "Face ID";
  const quickSignIn = rememberedAccount && capability?.available && configured
    ? {
      label: biometricLabel,
      icon: (capability.kind === "face" ? "face-id" : "finger-print") as IconName,
      name: firstName(rememberedAccount.name),
      run: async () => {
        setLoading("biometric");
        try {
          const released = await signInWithBiometrics();
          if (!released.ok) {
            if (released.reason === "invalidated") {
              toast.info(`${biometricLabel} sign-in was reset`, "Your phone's biometrics changed. Sign in with your password, then turn it on again in Settings.");
            } else if (released.reason === "failed") {
              toast.error(`Couldn't use ${biometricLabel}`, "Sign in with your password instead.");
            }
            return;
          }
          const { email: address, password: stored } = released.credential;
          try {
            const session = await signIn({ email: address, password: stored });
            welcome(session, address, false);
          } catch (error) {
            const copy = describeAuthError(error, "sign_in");
            if (copy.kind === "invalid_credentials") {
              // The password changed somewhere else, so the stored one can never work again.
              await disableBiometricSignIn();
              toast.info("Your password has changed", `Sign in with your new password, then turn ${biometricLabel} back on.`);
            } else if (copy.kind === "email_not_confirmed") {
              showConfirmEmail(address);
            } else {
              toast.error(copy.title, copy.message);
            }
          }
        } finally {
          setLoading(null);
        }
      },
    }
    : null;

  return {
    mode,
    switchMode,
    notice,
    name,
    setName,
    email,
    setEmail,
    password,
    setPassword,
    showPassword,
    toggleShowPassword: () => setShowPassword((shown) => !shown),
    nameError: submitted && !nameValid ? "Add your name." : undefined,
    emailError: submitted && !emailValid ? "Enter a valid email address." : undefined,
    passwordError: submitted ? passwordProblem : undefined,
    passwordHint: mode === "signup" ? PASSWORD_HINT : undefined,
    passwordStrength: (mode === "signup" && password.length > 0 ? passwordStrength(password) : null) as PasswordStrength | null,
    loading: loading === "form",
    biometricLoading: loading === "biometric",
    resendLoading: loading === "resend",
    busy: loading !== null,
    resendIn,
    resend,
    submit,
    quickSignIn,
    returnPath,
  };
}
