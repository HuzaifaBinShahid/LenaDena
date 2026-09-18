import { createContext, useContext, useMemo, type ReactNode } from "react";
import { StyleSheet } from "react-native";
import { palettes, type Palette, type Scheme } from "./palettes";

export type Theme = {
  scheme: Scheme;
  isDark: boolean;
  colors: Palette;
};

const lightTheme: Theme = { scheme: "light", isDark: false, colors: palettes.light };
const darkTheme: Theme = { scheme: "dark", isDark: true, colors: palettes.dark };

// Outside the provider (toasts, the launch splash) everything renders in the light theme.
const ThemeContext = createContext<Theme>(lightTheme);

export function ThemeProvider({ scheme, children }: { scheme: Scheme; children: ReactNode }) {
  const value = useMemo(() => (scheme === "dark" ? darkTheme : lightTheme), [scheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** The resolved light or dark theme. Use `colors` from here, never the static tokens, in themed UI. */
export function useTheme() {
  return useContext(ThemeContext);
}

/**
 * Theme-aware `StyleSheet.create`. The factory runs once per scheme and is cached, so the
 * hook is as cheap as a module-level stylesheet:
 *
 *   const useStyles = makeStyles((c) => ({ card: { backgroundColor: c.raised } }));
 *   function Card() { const styles = useStyles(); ... }
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(factory: (colors: Palette, theme: Theme) => T) {
  const cache: Partial<Record<Scheme, T>> = {};
  return function useStyles(): T {
    const theme = useTheme();
    const cached = cache[theme.scheme];
    if (cached) return cached;
    const created = StyleSheet.create(factory(theme.colors, theme));
    cache[theme.scheme] = created;
    return created;
  };
}
