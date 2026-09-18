import { createElement } from "react";
import { StyleSheet, Text as NativeText, View } from "react-native";
import { Icon, type IconName } from "@/components/ui/Icon";
import type { StandingTone } from "@/features/people/people";
import { makeStyles, useTheme } from "@/theme/ThemeProvider";
import { colors } from "@/theme/tokens";

export type BalanceChipProps = {
  /** "Owed to you", "You owe", "PKR"… */
  label: string;
  /** The formatted amount (or a short status such as "All settled"). */
  value: string;
  tone: StandingTone;
  /** Default: arrow-down for positive, arrow-up for negative, check for neutral. */
  icon?: IconName;
  /** "hero" sits on the brand's dark violet cards; "light" (default) on the canvas. */
  appearance?: "light" | "hero";
};

const DEFAULT_ICONS: Record<StandingTone, IconName> = {
  positive: "arrow-down",
  negative: "arrow-up",
  neutral: "check",
};

/**
 * A neutral outlined pill with a tinted direction glyph, a quiet label and the amount. The glyph and the label
 * carry the meaning, so the semantic colour is never the only signal (and never fills the pill).
 */
export function BalanceChip({ label, value, tone, icon, appearance = "light" }: BalanceChipProps) {
  const { colors: c } = useTheme();
  const styles = useStyles();
  const hero = appearance === "hero";
  // On the always-dark hero the bright tints read best; on the canvas the theme's semantic colours do.
  const accent = tone === "positive"
    ? hero ? colors.mintBright : c.mint
    : tone === "negative"
      ? hero ? colors.coralBright : c.coral
      : hero ? colors.lavender : c.violet;
  const glyphFill = tone === "positive"
    ? hero ? "rgba(111,224,184,0.16)" : c.mintSoft
    : tone === "negative"
      ? hero ? "rgba(255,141,166,0.16)" : c.coralSoft
      : hero ? "rgba(181,165,255,0.18)" : c.violetSoft;

  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={[shared.chip, hero ? styles.chipHero : styles.chipLight]}
    >
      <View style={[shared.glyph, { backgroundColor: glyphFill }]}>
        <Icon name={icon ?? DEFAULT_ICONS[tone]} size={13} color={accent} />
      </View>
      <View style={shared.copy}>
        {createElement(NativeText, { numberOfLines: 1, maxFontSizeMultiplier: 1.3, style: [shared.label, hero ? styles.labelHero : styles.labelLight] }, label)}
        {createElement(
          NativeText,
          { numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.8, maxFontSizeMultiplier: 1.3, style: [shared.value, { color: tone === "neutral" ? (hero ? colors.white : c.ink) : accent }] },
          value,
        )}
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  chipLight: {
    backgroundColor: c.raised,
    borderColor: c.line,
  },
  chipHero: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: "rgba(255,255,255,0.14)",
  },
  labelLight: {
    color: c.slate,
  },
  labelHero: {
    color: "rgba(255,255,255,0.7)",
  },
}));

const shared = StyleSheet.create({
  chip: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 10,
    paddingRight: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
  },
  glyph: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: {
    flexShrink: 1,
    minWidth: 0,
  },
  label: {
    fontFamily: "Manrope_600SemiBold",
    fontSize: 11,
    lineHeight: 14,
  },
  value: {
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 15,
    lineHeight: 20,
  },
});
