import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import { ApiError, apiRequest } from "@/lib/api";
import { hasSupabaseConfig, supabase } from "@/lib/supabase";

export type AuthMode = "signup" | "signin";

export type AuthResult =
  | { kind: "signed_in"; created: boolean; name: string }
  | { kind: "link_sent" };

type AuthenticateInput = {
  mode: AuthMode;
  email: string;
  name?: string;
  /** App path to return to when the fallback email link is opened, such as an invite. */
  returnPath?: string;
};

type AuthContextValue = {
  session: Session | null;
  ready: boolean;
  configured: boolean;
  /** Whether the API creates accounts and signs in without an email link. `null` while unknown. */
  instantAuth: boolean | null;
  authenticate: (input: AuthenticateInput) => Promise<AuthResult>;
  signOut: () => Promise<void>;
};

type InstantAuthResponse = { tokenHash: string; created: boolean; name: string };

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabase);
  const [instantAuth, setInstantAuth] = useState<boolean | null>(null);
  const optionsRequest = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    void client.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setReady(true);
    });
    // Email-link fallback: Supabase returns the session tokens in the redirect URL.
    const handleUrl = async (url: string) => {
      const hash = url.includes("#") ? url.slice(url.indexOf("#") + 1) : "";
      const query = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
      const params = new URLSearchParams(hash || query);
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      if (accessToken && refreshToken) await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    };
    void Linking.getInitialURL().then((url) => url ? handleUrl(url) : undefined);
    const linkSubscription = Linking.addEventListener("url", ({ url }) => void handleUrl(url));
    return () => {
      data.subscription.unsubscribe();
      linkSubscription.remove();
    };
  }, []);

  const loadInstantAuth = useCallback(() => {
    optionsRequest.current ??= apiRequest<{ instantAuth: boolean }>("/v1/auth/options")
      .then((options) => {
        setInstantAuth(options.instantAuth);
        return options.instantAuth;
      })
      .catch((error: unknown) => {
        optionsRequest.current = null;
        // Only an API that lacks the route means "no instant sign-in"; rate limits, outages and network
        // failures are surfaced to the caller and asked again next time.
        if (error instanceof ApiError && error.status === 404) {
          setInstantAuth(false);
          return false;
        }
        throw error;
      });
    return optionsRequest.current;
  }, []);

  useEffect(() => {
    if (hasSupabaseConfig) void loadInstantAuth().catch(() => undefined);
  }, [loadInstantAuth]);

  const authenticate = useCallback(async ({ mode, email, name, returnPath }: AuthenticateInput): Promise<AuthResult> => {
    const client = supabase;
    if (!client) throw new Error("Accounts need Supabase to be configured. Continue with the demo instead.");
    const normalizedEmail = email.trim().toLowerCase();
    const trimmedName = name?.trim() ?? "";

    if (instantAuth ?? await loadInstantAuth()) {
      try {
        const response = await apiRequest<InstantAuthResponse>("/v1/auth/instant", {
          method: "POST",
          body: { mode, email: normalizedEmail, ...(trimmedName ? { name: trimmedName } : {}) },
        });
        const { error } = await client.auth.verifyOtp({ token_hash: response.tokenHash, type: "email" });
        if (error) throw error;
        return { kind: "signed_in", created: response.created, name: response.name };
      } catch (error) {
        if (!(error instanceof ApiError && error.code === "instant_auth_disabled")) throw error;
        setInstantAuth(false);
      }
    }

    const { error } = await client.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: Linking.createURL(returnPath ?? "/"),
        shouldCreateUser: mode === "signup",
        ...(mode === "signup" && trimmedName ? { data: { name: trimmedName } } : {}),
      },
    });
    if (error) throw error;
    return { kind: "link_sent" };
  }, [instantAuth, loadInstantAuth]);

  const signOut = useCallback(async () => {
    const client = supabase;
    if (!client) return;
    const { error } = await client.auth.signOut();
    // supabase-js clears the local session even when revoking fails, except when an expired session
    // cannot be refreshed offline; only then is the person still signed in.
    if (error && (await client.auth.getSession()).data.session) {
      throw new Error("You're offline, so LenaDena couldn't sign you out. Try again when you're connected.");
    }
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    ready,
    configured: hasSupabaseConfig,
    instantAuth,
    authenticate,
    signOut,
  }), [authenticate, instantAuth, ready, session, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
