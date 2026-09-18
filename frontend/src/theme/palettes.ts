import { colors } from "./tokens";

export type Scheme = "light" | "dark";
export type ColorName = keyof typeof colors;
export type Palette = { readonly [K in ColorName]: string };

/** The light palette is the original token set; `colors` from tokens.ts stays its static alias. */
export const lightPalette: Palette = colors;

/**
 * Dark mode is a deep night-purple, not grey: surfaces get lighter as they rise
 * (canvas < raised < surface), so hierarchy reads without shadows. Brand accents that
 * already sit on dark shells (lavender, lime, violetStrong, the bright tints) keep their
 * values; neutrals flip, and semantic colours move to brighter tints that stay readable
 * on dark surfaces. Keep this in sync with the `.dark:root` block in global.css.
 */
export const darkPalette: Palette = {
  ink: "#F3EFFF",
  inkSoft: "#D4CCF0",
  plum: "#251852",
  canvas: "#110B22",
  raised: "#1B1433",
  surface: "#271E45",
  // Same as light: white labels on violet fills (buttons, pills) stay at 4.7:1. Small violet text
  // switches to lavender in dark instead (violet is only 4.1:1 on the dark canvas).
  violet: "#7657F6",
  violetStrong: "#4B2AA4",
  violetSoft: "#2B2160",
  lavender: "#B5A5FF",
  lavenderSoft: "#211A45",
  lime: "#A9F0D6",
  limeSoft: "#15302C",
  mint: "#5AD6AC",
  mintSoft: "#10302A",
  coral: "#FF7E9A",
  coralSoft: "#3B1730",
  gold: "#F2BD6B",
  goldSoft: "#33250F",
  slate: "#A79FC3",
  muted: "#766E93",
  line: "#2F2653",
  white: "#FFFFFF",
  mintBright: "#6FE0B8",
  coralBright: "#FF8DA6",
  goldBright: "#F4C27A",
  night: "#0D0720",
  backdrop: "rgba(3,1,10,0.62)",
  shadow: "#000000",
  // Lifted from the canvas so dark shells still read as their own surface.
  shell: "#1D1442",
  shellEnd: "#3E2A8C",
};

export const palettes: Record<Scheme, Palette> = { light: lightPalette, dark: darkPalette };
