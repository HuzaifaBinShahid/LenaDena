import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { SupabaseClient, Session } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import { useToast } from "@/components/ui/Toast";
import { describeAuthError } from "@/features/auth/authErrors";
import { parseAuthLink } from "@/features/auth/authLinks";
import { hasSupabaseConfig, supabase } from "@/lib/supabase";

/**
 * Opening a reset link signs the person in. Remembering whose reset is unfinished (in storage, not memory) means
 * killing the app before choosing a password cannot leave them signed in without having chosen one.
 */
const recoveryPendingKey = "lenadena.recovery-pending";

function readRecoveryPending(): string | null {
  try {
    return globalThis.localStorage?.getItem(recoveryPendingKey) ?? null;
  } catch {
    return null;
  }
}

function writeRecoveryPending(userId: string | null) {
  try {
    if (userId) globalThis.localStorage?.setItem(recoveryPendingKey, userId);
    else globalThis.localStorage?.removeItem(recoveryPendingKey);
  } catch {
    // Storage can be unavailable; the in-memory flag still covers this run.
  }
}

export type SignUpResult =
  /** "Confirm email" is off in Supabase: the account is ready and the session has landed. */
  | { kind: "signed_in" }
  /** Supabase sent a confirmation email; the account cannot sign in until its link is opened. */
  | { kind: "confirm_email"; email: string };

type SignUpInput = {
  email: string;
  password: string;
  name: string;
  /** App path to return to once the confirmation link is opened, such as an invite. */
  returnPath?: string;
};

type AuthContextValue = {
  session: Session | null;
  ready: boolean;
  configured: boolean;
  /** A password-reset link was opened: the person must choose a new password before anything else. */
  recovering: boolean;
  /** An email link is being checked (or the app is still looking for one at launch): screens that depend on it should wait. */
  verifyingLink: boolean;
  signUp: (input: SignUpInput) => Promise<SignUpResult>;
  /** Resolves with the new session. Rejects with the Supabase error; `describeAuthError` turns it into words. */
  signIn: (input: { email: string; password: string }) => Promise<Session>;
  /** Emails a reset link. Answers the same whether or not the address has an account, so it can't be used to find out. */
  requestPasswordReset: (email: string) => Promise<void>;
  resendConfirmation: (email: string) => Promise<void>;
  /** Checks a password against the account without changing anything (used before saving it behind biometrics). */
  confirmPassword: (input: { email: string; password: string }) => Promise<void>;
  /** For a signed-in person: checks the current password first, so an unlocked phone can't silently change it. */
  changePassword: (input: { email: string; currentPassword: string; newPassword: string }) => Promise<void>;
  /** For someone who opened a reset link. */
  setNewPassword: (newPassword: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function requireClient(): SupabaseClient {
  if (!supabase) throw new Error("Accounts need Supabase to be configured. Continue with the demo instead.");
  return supabase;
}

const normalize = (email: string) => email.trim().toLowerCase();

/** A new password should end every other session, so a session someone else holds stops working. */
async function endOtherSessions(client: SupabaseClient) {
  try {
    await client.auth.signOut({ scope: "others" });
  } catch {
    // The password is already changed; failing to end other sessions must not look like a failed change.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabase);
  const [recovering, setRecovering] = useState(false);
  const [verifyingLink, setVerifyingLink] = useState(Boolean(supabase));
  /** Links being read: the one the app was opened with, plus any that arrive while it runs. */
  const pendingLinks = useRef(supabase ? 1 : 0);
  const recoveringRef = useRef(false);
  const handledCodes = useRef(new Set<string>());

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    void client.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
      if (data.session && readRecoveryPending() === data.session.user.id) {
        recoveringRef.current = true;
        setRecovering(true);
      }
    });
    const { data } = client.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setReady(true);
      if (event === "PASSWORD_RECOVERY") {
        recoveringRef.current = true;
        setRecovering(true);
        writeRecoveryPending(nextSession?.user.id ?? null);
      } else if (event === "SIGNED_OUT") {
        recoveringRef.current = false;
        setRecovering(false);
        writeRecoveryPending(null);
      }
    });

    // Confirm-email and reset-password links open the app with a one-time code. Only this phone holds the secret
    // that makes the code usable (PKCE), so a link made by someone else can't sign it in to their account.
    const handleUrl = async (url: string | null) => {
      const link = parseAuthLink(url);
      if (link.kind === "none") return;
      if (link.kind === "error") {
        // Only the code is used: the description comes from whoever made the link, so it is never shown.
        const copy = describeAuthError({ code: link.code }, "link");
        toastRef.current.error(copy.title, copy.message);
        return;
      }
      // The same link arrives as the launch URL and again as an event; a code works once.
      if (handledCodes.current.has(link.code)) return;
      handledCodes.current.add(link.code);
      // A link without a flow id (an older email, or one made by someone else) cannot say which request it answers.
      // Using it would try the newest secret and burn it, so it is refused without touching any.
      if (!link.flowId) {
        const copy = describeAuthError({ code: "flow_state_not_found" }, "link");
        toastRef.current.error(copy.title, copy.message);
        return;
      }
      const { error } = await client.auth.exchangeCodeForSession(link.code, { flowId: link.flowId });
      if (error) {
        const copy = describeAuthError(error, "link");
        toastRef.current.error(copy.title, copy.message);
        return;
      }
      if (!recoveringRef.current) toastRef.current.success("You're signed in", "Your email address is confirmed.");
    };
    const settleLink = () => {
      pendingLinks.current = Math.max(0, pendingLinks.current - 1);
      setVerifyingLink(pendingLinks.current > 0);
    };
    pendingLinks.current = 1;
    void Linking.getInitialURL()
      .then((url) => handleUrl(url))
      .catch(() => undefined)
      .finally(settleLink);
    const linkSubscription = Linking.addEventListener("url", ({ url }) => {
      // A counter, not a flag: two links in a row must not let the first one's end hide the second one's wait.
      pendingLinks.current += 1;
      setVerifyingLink(true);
      void handleUrl(url).catch(() => undefined).finally(settleLink);
    });
    return () => {
      data.subscription.unsubscribe();
      linkSubscription.remove();
    };
  }, []);

  const signUp = useCallback(async ({ email, password, name, returnPath }: SignUpInput): Promise<SignUpResult> => {
    const client = requireClient();
    const address = normalize(email);
    const { data, error } = await client.auth.signUp({
      email: address,
      password,
      options: { emailRedirectTo: Linking.createURL(returnPath ?? "/"), data: { name: name.trim() } },
    });
    if (error) throw error;
    // With "Confirm email" on, Supabase answers with no session, and answers the same for an address that already
    // has an account, so signing up can't be used to find out who does.
    return data.session ? { kind: "signed_in" } : { kind: "confirm_email", email: address };
  }, []);

  const signIn = useCallback(async ({ email, password }: { email: string; password: string }) => {
    const { data, error } = await requireClient().auth.signInWithPassword({ email: normalize(email), password });
    if (error) throw error;
    return data.session;
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    const { error } = await requireClient().auth.resetPasswordForEmail(normalize(email), { redirectTo: Linking.createURL("/reset-password") });
    if (error) throw error;
  }, []);

  const resendConfirmation = useCallback(async (email: string) => {
    const { error } = await requireClient().auth.resend({ type: "signup", email: normalize(email), options: { emailRedirectTo: Linking.createURL("/") } });
    if (error) throw error;
  }, []);

  const confirmPassword = useCallback(async ({ email, password }: { email: string; password: string }) => {
    const { error } = await requireClient().auth.signInWithPassword({ email: normalize(email), password });
    if (error) throw error;
  }, []);

  const changePassword = useCallback(async ({ email, currentPassword, newPassword }: { email: string; currentPassword: string; newPassword: string }) => {
    const client = requireClient();
    const reauthenticated = await client.auth.signInWithPassword({ email: normalize(email), password: currentPassword });
    if (reauthenticated.error) throw reauthenticated.error;
    const { error } = await client.auth.updateUser({ password: newPassword });
    if (error) throw error;
    await endOtherSessions(client);
  }, []);

  const setNewPassword = useCallback(async (newPassword: string) => {
    const client = requireClient();
    const { error } = await client.auth.updateUser({ password: newPassword });
    if (error) throw error;
    recoveringRef.current = false;
    setRecovering(false);
    writeRecoveryPending(null);
    await endOtherSessions(client);
  }, []);

  const signOut = useCallback(async () => {
    const client = supabase;
    if (!client) return;
    const { error } = await client.auth.signOut();
    // supabase-js clears the local session even when revoking fails, except when an expired session
    // cannot be refreshed offline; only then is the person still signed in.
    if (error && (await client.auth.getSession()).data.session) {
      throw new Error("You're offline, so LenaDena couldn't sign you out. Try again when you're connected.");
    }
    recoveringRef.current = false;
    setRecovering(false);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    ready,
    configured: hasSupabaseConfig,
    recovering,
    verifyingLink,
    signUp,
    signIn,
    requestPasswordReset,
    resendConfirmation,
    confirmPassword,
    changePassword,
    setNewPassword,
    signOut,
  }), [changePassword, confirmPassword, ready, recovering, requestPasswordReset, resendConfirmation, session, setNewPassword, signIn, signOut, signUp, verifyingLink]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
