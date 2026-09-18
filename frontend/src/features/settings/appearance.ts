// Pure copy for the Settings appearance picker. No react-native imports: Vitest runs this file,
// so it only takes types from the app (D21).
import type { ThemePreference } from "@/features/preferences/PreferencesProvider";
import type { Scheme } from "@/theme/palettes";

export type AppearanceOption = { key: ThemePreference; label: string; hint?: string };

/** Picker order: the two fixed looks, then the one that follows the phone. */
export const APPEARANCE_OPTIONS: readonly AppearanceOption[] = [
  { key: "light", label: "Light" },
  { key: "dark", label: "Dark" },
  { key: "system", label: "System", hint: "Follows your phone's light or dark setting" },
];

/** The line under the picker. `emphasis` (the look showing right now) is set in bold after `text`. */
export type AppearanceHint = { text: string; emphasis?: string };

export function appearanceHint(theme: ThemePreference, scheme: Scheme): AppearanceHint {
  if (theme === "system") return { text: "Follows your phone — currently ", emphasis: scheme === "dark" ? "Dark" : "Light" };
  return { text: theme === "dark" ? "Stays dark, whatever your phone uses" : "Stays light, whatever your phone uses" };
}
