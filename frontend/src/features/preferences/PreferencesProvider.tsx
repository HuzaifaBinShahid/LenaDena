import "expo-sqlite/localStorage/install";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useColorScheme } from "react-native";
import { supabase } from "@/lib/supabase";

export type ThemePreference = "dusk" | "cloud" | "midnight" | "system";
export type EmailTone = "friendly" | "cheeky" | "chaos" | "quiet";

const palettes = {
  dusk: { header: "#1A1037", headerEnd: "#6040AE", screen: "#F5F2FA", surface: "#FCFAFF" },
  cloud: { header: "#382660", headerEnd: "#8A71C8", screen: "#F7F4FB", surface: "#FFFFFF" },
  midnight: { header: "#0F0A20", headerEnd: "#34205F", screen: "#EFEBF6", surface: "#FAF8FD" },
} as const;

type PreferencesValue = {
  theme: ThemePreference;
  emailTone: EmailTone;
  voiceLocale: string;
  speechLocale: string;
  palette: (typeof palettes)[keyof typeof palettes];
  setTheme: (value: ThemePreference) => void;
  setEmailTone: (value: EmailTone) => void;
  setVoiceLocale: (value: string) => void;
};

const PreferencesContext = createContext<PreferencesValue | null>(null);
const storageKey = "oweyaar.preferences.v1";

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [theme, setTheme] = useState<ThemePreference>("dusk");
  const [emailTone, setEmailTone] = useState<EmailTone>("friendly");
  const [voiceLocale, setVoiceLocale] = useState("system");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = globalThis.localStorage?.getItem(storageKey);
      if (saved) {
        const value = JSON.parse(saved) as Partial<{ theme: ThemePreference; emailTone: EmailTone; voiceLocale: string }>;
        if (value.theme && value.theme in { dusk: 1, cloud: 1, midnight: 1, system: 1 }) setTheme(value.theme);
        if (value.emailTone && value.emailTone in { friendly: 1, cheeky: 1, chaos: 1, quiet: 1 }) setEmailTone(value.emailTone);
        if (value.voiceLocale) setVoiceLocale(value.voiceLocale);
      }
    } catch {
      globalThis.localStorage?.removeItem(storageKey);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (loaded) globalThis.localStorage?.setItem(storageKey, JSON.stringify({ theme, emailTone, voiceLocale }));
  }, [emailTone, loaded, theme, voiceLocale]);

  useEffect(() => {
    const client = supabase;
    if (!loaded || !client) return;
    void client.auth.getUser().then(({ data }) => data.user
      ? client.from("profiles").update({ theme, email_tone: emailTone, updated_at: new Date().toISOString() }).eq("id", data.user.id)
      : undefined);
  }, [emailTone, loaded, theme]);

  const resolvedTheme = theme === "system" ? systemScheme === "dark" ? "midnight" : "dusk" : theme;
  const speechLocale = voiceLocale.trim().toLowerCase() === "system" || !voiceLocale.trim()
    ? Intl.DateTimeFormat().resolvedOptions().locale
    : voiceLocale.trim();
  const value = useMemo<PreferencesValue>(() => ({
    theme,
    emailTone,
    voiceLocale,
    speechLocale,
    palette: palettes[resolvedTheme],
    setTheme,
    setEmailTone,
    setVoiceLocale,
  }), [emailTone, resolvedTheme, speechLocale, theme, voiceLocale]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error("usePreferences must be used inside PreferencesProvider");
  return value;
}
