// Maps a stored group accent hex onto one of five fixed LenaDena skins. The raw accent is never rendered (§1.7).
// No react-native imports: Vitest runs this file, so runtime imports stay relative (D21).
import { darkPalette, type Scheme } from "../../theme/palettes";
import { colors } from "../../theme/tokens";

/**
 * `disc` and `discOpacity` decorate the always-dark group card art, so they are the same in both themes.
 * `tint` and `icon` are the light-theme colours of the small group tile; use `groupSkinTone` for the current theme.
 */
export type GroupSkin = { key: "violet" | "indigo" | "mint" | "gold" | "rose"; name: string; disc: string; discOpacity: number; tint: string; icon: string };

const SKINS: Record<GroupSkin["key"], GroupSkin> = {
  violet: Object.freeze({ key: "violet", name: "Lavender", disc: colors.lavender, discOpacity: 0.9, tint: colors.violetSoft, icon: colors.violet }),
  indigo: Object.freeze({ key: "indigo", name: "Violet", disc: colors.violet, discOpacity: 0.95, tint: colors.lavenderSoft, icon: colors.violetStrong }),
  mint: Object.freeze({ key: "mint", name: "Mint", disc: colors.lime, discOpacity: 0.85, tint: colors.limeSoft, icon: colors.mint }),
  gold: Object.freeze({ key: "gold", name: "Gold", disc: colors.goldBright, discOpacity: 0.85, tint: colors.goldSoft, icon: colors.gold }),
  rose: Object.freeze({ key: "rose", name: "Rose", disc: colors.coralBright, discOpacity: 0.8, tint: colors.coralSoft, icon: colors.coral }),
};

export type GroupSkinTone = { tint: string; icon: string };

function lightTone(skin: GroupSkin): GroupSkinTone {
  return Object.freeze({ tint: skin.tint, icon: skin.icon });
}

/**
 * Tile colours per theme. Light is the skin's own pastel tint and icon. Dark swaps the pastels (which would glow on
 * the night canvas) for the deep themed tints, with an icon colour that keeps at least 3:1 against them; the
 * indigo icon moves from violetStrong, which sinks into dark tints, to lavender.
 */
const TONES: Record<Scheme, Record<GroupSkin["key"], GroupSkinTone>> = {
  light: {
    violet: lightTone(SKINS.violet),
    indigo: lightTone(SKINS.indigo),
    mint: lightTone(SKINS.mint),
    gold: lightTone(SKINS.gold),
    rose: lightTone(SKINS.rose),
  },
  dark: {
    // A lifted violet (4.9:1 on the tint) keeps this tile distinct from indigo's lavender icon; the brand violet is only 3:1 here.
    violet: Object.freeze({ tint: darkPalette.violetSoft, icon: "#9C85FF" }),
    indigo: Object.freeze({ tint: darkPalette.lavenderSoft, icon: darkPalette.lavender }),
    mint: Object.freeze({ tint: darkPalette.limeSoft, icon: darkPalette.mint }),
    gold: Object.freeze({ tint: darkPalette.goldSoft, icon: darkPalette.gold }),
    rose: Object.freeze({ tint: darkPalette.coralSoft, icon: darkPalette.coral }),
  },
};

/** The small group tile's background and icon colour for a skin in the current theme (`useTheme().scheme`). */
export function groupSkinTone(skin: GroupSkin, scheme: Scheme): GroupSkinTone {
  return TONES[scheme][skin.key];
}

const MIN_SATURATION = 0.15;

/** Hue in degrees [0, 360) and HSL saturation [0, 1] for "#RGB" or "#RRGGBB" (the "#" is optional). */
function hueAndSaturation(accent: string): { hue: number; saturation: number } | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(accent.trim());
  const digits = match?.[1];
  if (!digits) return null;
  const full = digits.length === 3 ? digits.split("").map((digit) => digit + digit).join("") : digits;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return { hue: 0, saturation: 0 };
  const lightness = (max + min) / 510;
  const saturation = delta / 255 / (1 - Math.abs(2 * lightness - 1));
  let hue: number;
  if (max === r) hue = 60 * (((g - b) / delta) % 6);
  else if (max === g) hue = 60 * ((b - r) / delta + 2);
  else hue = 60 * ((r - g) / delta + 4);
  if (hue < 0) hue += 360;
  // Round away floating-point noise so exact boundary hues land in a predictable bucket.
  hue = Math.round(hue * 1000) / 1000;
  return { hue: hue >= 360 ? hue - 360 : hue, saturation };
}

/**
 * Buckets (lower bound inclusive): violet [235, 330), indigo [170, 235), mint [70, 170), gold [20, 70), rose [330, 360) and [0, 20).
 * Missing or invalid accents and greys (saturation below 0.15) use the violet skin.
 */
export function groupSkin(accent?: string | null): GroupSkin {
  if (!accent) return SKINS.violet;
  const parsed = hueAndSaturation(accent);
  if (!parsed || parsed.saturation < MIN_SATURATION) return SKINS.violet;
  const { hue } = parsed;
  if (hue >= 235 && hue < 330) return SKINS.violet;
  if (hue >= 170 && hue < 235) return SKINS.indigo;
  if (hue >= 70 && hue < 170) return SKINS.mint;
  if (hue >= 20 && hue < 70) return SKINS.gold;
  return SKINS.rose;
}
