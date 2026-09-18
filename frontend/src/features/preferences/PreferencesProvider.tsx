import "expo-sqlite/localStorage/install";
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Platform, useColorScheme } from "react-native";
import { colorScheme as nativewindColorScheme } from "nativewind";
import { supabase } from "@/lib/supabase";
import { palettes, type Scheme } from "@/theme/palettes";
import { ThemeProvider } from "@/theme/ThemeProvider";

/** Appearance: follow the phone, or force light or dark. */
export type ThemePreference = "light" | "dark" | "system";
export type EmailTone = "friendly" | "cheeky" | "chaos" | "quiet";

type SavedPreferences = { theme: ThemePreference; emailTone: EmailTone; voiceLocale: string };

const storageKey = "lenadena.preferences.v1";
const defaults: SavedPreferences = { theme: "system", emailTone: "friendly", voiceLocale: "system" };

// Before real dark mode the choices were header palettes; map them onto appearances.
const storedThemes: Record<string, ThemePreference> = {
  light: "light",
  dark: "dark",
  system: "system",
  dusk: "light",
  cloud: "light",
  midnight: "dark",
};
// profiles.theme still only accepts the original names.
const profileThemes: Record<ThemePreference, string> = { light: "dusk", dark: "midnight", system: "system" };
const emailTones: Record<EmailTone, true> = { friendly: true, cheeky: true, chaos: true, quiet: true };

/**
 * Brand shell colours per scheme.
 * @deprecated Use `useTheme().colors` (theme/ThemeProvider). Kept so older call sites follow the theme.
 */
const shells = {
  light: { header: palettes.light.shell, headerEnd: palettes.light.shellEnd, screen: palettes.light.canvas, surface: palettes.light.raised },
  dark: { header: palettes.dark.shell, headerEnd: palettes.dark.shellEnd, screen: palettes.dark.canvas, surface: palettes.dark.raised },
} as const;

type PreferencesValue = {
  /** The stored appearance choice. */
  theme: ThemePreference;
  /** What the app is showing right now. */
  scheme: Scheme;
  emailTone: EmailTone;
  voiceLocale: string;
  speechLocale: string;
  /** @deprecated Use `useTheme().colors`. */
  palette: (typeof shells)[Scheme];
  setTheme: (value: ThemePreference) => void;
  setEmailTone: (value: EmailTone) => void;
  setVoiceLocale: (value: string) => void;
};

const PreferencesContext = createContext<PreferencesValue | null>(null);

// localStorage from expo-sqlite is synchronous, so the saved appearance applies on the first
// frame instead of flashing the light theme.
function readSaved(): SavedPreferences {
  try {
    const saved = globalThis.localStorage?.getItem(storageKey);
    if (!saved) return defaults;
    const value = JSON.parse(saved) as Partial<Record<keyof SavedPreferences, unknown>>;
    return {
      theme: typeof value.theme === "string" ? storedThemes[value.theme] ?? defaults.theme : defaults.theme,
      emailTone: typeof value.emailTone === "string" && value.emailTone in emailTones ? value.emailTone as EmailTone : defaults.emailTone,
      voiceLocale: typeof value.voiceLocale === "string" && value.voiceLocale ? value.voiceLocale : defaults.voiceLocale,
    };
  } catch {
    globalThis.localStorage?.removeItem(storageKey);
    return defaults;
  }
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(readSaved);
  const [theme, setTheme] = useState<ThemePreference>(initial.theme);
  const [emailTone, setEmailTone] = useState<EmailTone>(initial.emailTone);
  const [voiceLocale, setVoiceLocale] = useState(initial.voiceLocale);
  // With "system", this is the phone's scheme; a forced choice overrides it app-wide.
  const deviceScheme = useColorScheme();
  const scheme: Scheme = theme === "system" ? deviceScheme === "dark" ? "dark" : "light" : theme;

  // One switch drives NativeWind's CSS variables and, on native, Appearance itself, so
  // keyboards, date pickers and system dialogs match the app.
  useLayoutEffect(() => {
    nativewindColorScheme.set(Platform.OS === "web" ? scheme : theme);
  }, [scheme, theme]);

  useEffect(() => {
    globalThis.localStorage?.setItem(storageKey, JSON.stringify({ theme, emailTone, voiceLocale }));
  }, [emailTone, theme, voiceLocale]);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    void client.auth.getUser().then(({ data }) => data.user
      ? client.from("profiles").update({ theme: profileThemes[theme], email_tone: emailTone, updated_at: new Date().toISOString() }).eq("id", data.user.id)
      : undefined);
  }, [emailTone, theme]);

  const speechLocale = voiceLocale.trim().toLowerCase() === "system" || !voiceLocale.trim()
    ? Intl.DateTimeFormat().resolvedOptions().locale
    : voiceLocale.trim();
  const value = useMemo<PreferencesValue>(() => ({
    theme,
    scheme,
    emailTone,
    voiceLocale,
    speechLocale,
    palette: shells[scheme],
    setTheme,
    setEmailTone,
    setVoiceLocale,
  }), [emailTone, scheme, speechLocale, theme, voiceLocale]);

  return (
    <PreferencesContext.Provider value={value}>
      <ThemeProvider scheme={scheme}>{children}</ThemeProvider>
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error("usePreferences must be used inside PreferencesProvider");
  return value;
}
