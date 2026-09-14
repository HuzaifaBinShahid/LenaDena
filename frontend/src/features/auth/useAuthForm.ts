import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { useToast } from "@/components/ui/Toast";
import type { IconName } from "@/components/ui/Icon";
import { useAuth, type AuthMode } from "@/features/auth/AuthProvider";
import { useAppLock } from "@/features/security/AppLockProvider";
import { authenticationFailureMessage, isCancelledAuthentication } from "@/features/security/lock-policy";
import { ApiError, errorMessage } from "@/lib/api";

// Mirrors the API's email format check so an address is never accepted here and rejected there.
const emailPattern = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
export const NAME_MAX_LENGTH = 80;
export const EMAIL_MAX_LENGTH = 254;

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? "";
}

/** Only invite links may be resumed after authentication; everything else lands on the plan. */
export function authReturnPath(next: string | undefined) {
  return next && /^\/invite\/[A-Za-z0-9_-]+$/.test(next) ? next : "/";
}

export type AuthForm = ReturnType<typeof useAuthForm>;

export function useAuthForm(next: string | undefined) {
  const { configured, instantAuth, authenticate } = useAuth();
  const { capability, rememberedAccount, verifyForSignIn, forgetRememberedAccount } = useAppLock();
  const toast = useToast();
  const [mode, setMode] = useState<AuthMode>("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState<"form" | "biometric" | null>(null);
  const modeChosen = useRef(false);
  const returnPath = authReturnPath(next);
  const nameValid = mode === "signin" || (name.trim().length > 0 && name.trim().length <= NAME_MAX_LENGTH);
  const emailValid = email.trim().length <= EMAIL_MAX_LENGTH && emailPattern.test(email.trim());

  // Someone who turned on biometric unlock here is returning, so start on sign in.
  // The email is deliberately not prefilled: with email-only sign-in that would open the account to anyone holding the phone.
  useEffect(() => {
    if (rememberedAccount && !modeChosen.current) setMode("signin");
  }, [rememberedAccount]);

  const switchMode = (nextMode: AuthMode) => {
    modeChosen.current = true;
    setMode(nextMode);
    setSubmitted(false);
  };

  const run = async (input: { mode: AuthMode; email: string; name?: string }, source: "form" | "biometric") => {
    if (!configured) {
      toast.info("Demo mode", "Supabase isn't configured, so LenaDena opens the demo account.");
      router.replace("/");
      return;
    }
    setLoading(source);
    try {
      const result = await authenticate({ ...input, returnPath });
      if (result.kind === "link_sent") {
        toast.success("Check your inbox", `We sent a sign-in link to ${input.email.trim().toLowerCase()}. Open it on this phone.`);
        return;
      }
      // The auth screen redirects once the session lands; the toast carries the welcome.
      toast.success(
        result.created ? `Welcome to LenaDena, ${firstName(result.name)}` : `Welcome back, ${firstName(result.name)}`,
        result.created ? "Your account is ready. Add your first balance whenever you like." : undefined,
      );
    } catch (error) {
      if (error instanceof ApiError && error.code === "account_exists") {
        switchMode("signin");
        toast.info("You already have an account", "We switched to sign in. Tap Sign in to continue.");
        return;
      }
      if (error instanceof ApiError && error.code === "account_not_found") {
        if (source === "biometric") await forgetRememberedAccount();
        switchMode("signup");
        toast.info("No account uses that email", "Add your name to create one.");
        return;
      }
      const message = error instanceof ApiError && error.code === "validation_error" ? "Check your name and email, then try again." : errorMessage(error);
      toast.error(input.mode === "signup" ? "Couldn't create your account" : "Couldn't sign you in", message);
    } finally {
      setLoading(null);
    }
  };

  const submit = async () => {
    setSubmitted(true);
    if (!nameValid || !emailValid) return;
    await run({ mode, email, name }, "form");
  };

  const biometricLabel = capability?.label ?? "Face ID";
  const quickSignIn = rememberedAccount && capability?.available && instantAuth === true
    ? {
      label: biometricLabel,
      icon: (capability.kind === "face" ? "face-id" : "finger-print") as IconName,
      name: firstName(rememberedAccount.name),
      run: async () => {
        const check = await verifyForSignIn(rememberedAccount);
        if (!check.success) {
          if (!isCancelledAuthentication(check.error)) {
            const failure = authenticationFailureMessage(check.error, biometricLabel);
            toast.show({ title: failure.title, message: failure.message, tone: failure.tone });
          }
          return;
        }
        await run({ mode: "signin", email: rememberedAccount.email }, "biometric");
      },
    }
    : null;

  return {
    mode,
    switchMode,
    name,
    setName,
    email,
    setEmail,
    nameError: submitted && !nameValid ? "Add your name." : undefined,
    emailError: submitted && !emailValid ? "Enter a valid email address." : undefined,
    loading: loading === "form",
    biometricLoading: loading === "biometric",
    busy: loading !== null,
    submit,
    quickSignIn,
    /** False when the server only supports email links. */
    instantAuth,
    returnPath,
  };
}
