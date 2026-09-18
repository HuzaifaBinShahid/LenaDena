/**
 * Brand tokens for email. Mirrors frontend/src/theme/tokens.ts (light) and palettes.ts (dark).
 * Email clients need literal hex values in inline styles, so these are plain strings.
 * The Supabase auth templates in supabase/templates/*.html use the same values; keep them in sync.
 */
export const brand = {
  name: "LenaDena",
  tagline: "Track what friends owe, never move money",
  /** Manrope first (the app typeface), then the system UI font of each platform. */
  font: "Manrope, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  monoFont: "'SF Mono', SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
  light: {
    canvas: "#F5F2FA",
    card: "#FFFFFF",
    panel: "#F5F2FA",
    ink: "#171129",
    slate: "#6E6880",
    line: "#E3DDEC",
    violet: "#7657F6",
    violetStrong: "#4B2AA4",
    onViolet: "#FFFFFF",
  },
  dark: {
    canvas: "#110B22",
    card: "#1B1433",
    panel: "#271E45",
    ink: "#F3EFFF",
    slate: "#A79FC3",
    line: "#2F2653",
    link: "#B5A5FF",
  },
  badge: {
    violet: { light: { bg: "#EEE9FF", fg: "#7657F6" }, dark: { bg: "#2B2160", fg: "#B5A5FF" } },
    mint: { light: { bg: "#E5F7F1", fg: "#139A78" }, dark: { bg: "#10302A", fg: "#5AD6AC" } },
    coral: { light: { bg: "#FDECF1", fg: "#E86383" }, dark: { bg: "#3B1730", fg: "#FF7E9A" } },
    gold: { light: { bg: "#FFF3E2", fg: "#C78A35" }, dark: { bg: "#33250F", fg: "#F2BD6B" } },
  },
} as const;

export type BadgeTone = keyof typeof brand.badge;
