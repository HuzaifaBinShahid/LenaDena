import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import { hasSupabaseConfig, supabase } from "@/lib/supabase";

type AuthContextValue = {
  session: Session | null;
  ready: boolean;
  configured: boolean;
  sendMagicLink: (email: string, name: string, redirectTo?: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabase);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      return;
    }
    void client.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setReady(true);
    });
    const handleUrl = async (url: string) => {
      const hash = url.includes("#") ? url.slice(url.indexOf("#") + 1) : "";
      const query = url.includes("?") ? url.slice(url.indexOf("?") + 1).split("#")[0] ?? "" : "";
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

  const value = useMemo<AuthContextValue>(() => ({
    session,
    ready,
    configured: hasSupabaseConfig,
    sendMagicLink: async (email, name, redirectTo = "lenadena://") => {
      if (!supabase) {
        return;
      }
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo, data: { name } },
      });
      if (error) {
        throw error;
      }
    },
    signOut: async () => {
      if (supabase) {
        await supabase.auth.signOut();
      }
    },
  }), [session, ready]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return value;
}
