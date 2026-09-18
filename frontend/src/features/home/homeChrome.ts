// Per-tab top chrome of the home shell: header surface, status bar and the scrim fade.
// No react-native imports: Vitest runs this file.
import type { TabKey } from "@/features/ledger/types";
import type { Palette } from "@/theme/palettes";

export type HomeChrome = {
  /** Behind the header, the pull-down overscroll and the status-bar scrim. */
  surface: string;
  /** `surface` at zero alpha: the end of the scrim fade (a bare "transparent" fades through grey on iOS). */
  surfaceClear: string;
  /** "dark" when the top surface is the always-dark brand shell (Activity), in both themes. */
  tone: "light" | "dark";
  /** Status-bar content: light on dark surfaces. */
  statusBar: "light" | "dark";
};

/** Plan and Reviews sit on the canvas, Groups on its lavender wash, Activity on the dark shell. */
export function homeChrome(tab: TabKey, palette: Palette, isDark: boolean): HomeChrome {
  const tone = tab === "activity" ? "dark" : "light";
  const surface = tab === "activity" ? palette.shell : tab === "groups" ? palette.lavenderSoft : palette.canvas;
  return {
    surface,
    surfaceClear: clearColor(surface),
    tone,
    statusBar: tone === "dark" || isDark ? "light" : "dark",
  };
}

/**
 * The same colour at zero alpha, for gradient ends. Reads `#RGB`, `#RRGGBB`, `#RRGGBBAA`, `rgb()` and
 * `rgba()`; anything else falls back to "transparent".
 */
export function clearColor(color: string): string {
  const value = color.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value)?.[1];
  if (hex) {
    const full = hex.length === 3 ? hex.split("").map((digit) => digit + digit).join("") : hex.slice(0, 6);
    const channel = (start: number) => parseInt(full.slice(start, start + 2), 16);
    return `rgba(${channel(0)}, ${channel(2)}, ${channel(4)}, 0)`;
  }
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+%?\s*)?\)$/i.exec(value);
  if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, 0)`;
  return "transparent";
}
