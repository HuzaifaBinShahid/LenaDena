// The only source of shadows (§1.5). Elevation only goes on a view with a solid backgroundColor.
// Cards with art sticking out use elevation 0; the balance card uses an SVG fake shadow and never these; SVG filters are not used.
import { colors } from "./tokens";

export const shadows = {
  card:   { shadowColor: colors.plum, shadowOffset: { width: 0, height: 4 },  shadowOpacity: 0.05, shadowRadius: 10, elevation: 0 },
  raised: { shadowColor: colors.plum, shadowOffset: { width: 0, height: 8 },  shadowOpacity: 0.06, shadowRadius: 16, elevation: 2 },
  hero:   { shadowColor: colors.violetStrong, shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.28, shadowRadius: 22, elevation: 10 },
  accent: { shadowColor: colors.violetStrong, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.28, shadowRadius: 20, elevation: 8 },
  float:  { shadowColor: colors.violetStrong, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.42, shadowRadius: 16, elevation: 12 },
  band:   { shadowColor: colors.violetStrong, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.08, shadowRadius: 18, elevation: 3 },
  sheet:  { shadowColor: colors.plum, shadowOffset: { width: 0, height: -12 }, shadowOpacity: 0.18, shadowRadius: 28, elevation: 16 },
} as const;

export type ShadowName = keyof typeof shadows;
