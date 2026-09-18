import { createElement, memo, useState } from "react";
import { Image, StyleSheet, Text as NativeText, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Icon, type IconName } from "@/components/ui/Icon";
import { personInitials, personTint } from "@/features/people/people";
import { useTheme } from "@/theme/ThemeProvider";
import { colors } from "@/theme/tokens";

/** Where you stand with the person: mint ring = they owe you, coral = you owe them, violet = both ways. */
export type PersonAvatarStatus = "owed" | "owe" | "mixed" | "none";

export type PersonAvatarProps = {
  name: string;
  uri?: string | null;
  /** Diameter of the photo or initials disc, in points. */
  size: number;
  /**
   * Draws a status ring around the disc (with a small gap). "none" keeps the ring's space empty so a row of
   * avatars lines up; leave it out for a bare disc.
   */
  status?: PersonAvatarStatus;
  /** Adds the arrow badge at the bottom right for owed / owe / mixed, so colour is never the only signal. */
  badge?: boolean;
  /** The colour right behind the avatar: the badge rim cuts into it. Default: the theme canvas. */
  surfaceColor?: string;
  /** "bright" rings (mintBright / coralBright / lavender) for the brand's always-dark violet cards. */
  ringTone?: "theme" | "bright";
};

const BADGE_ICONS: Record<Exclude<PersonAvatarStatus, "none">, IconName> = {
  owed: "arrow-down",
  owe: "arrow-up",
  mixed: "exchange",
};

/** Ring stroke for a disc of `size`; the gap between ring and disc is the same width. */
export function personRingWidth(size: number) {
  return Math.max(2, Math.round(size * 0.04));
}

/** Outer box of an avatar drawn with a status ring (disc + ring + gap on both sides). */
export function personAvatarBox(size: number) {
  return size + personRingWidth(size) * 4;
}

/**
 * A saved person's avatar: their photo, or initials on a clay-tinted gradient disc that is the same for the
 * same name everywhere (see personTint). The tints are mid-tones with 4.5:1 initials, so they read on the light
 * and the night canvas alike; in dark mode a hairline `line` ring keeps photos from floating. Decorative for
 * screen readers: the row or button around it carries the name and balance.
 */
export const PersonAvatar = memo(function PersonAvatar({ name, uri, size, status, badge = false, surfaceColor, ringTone = "theme" }: PersonAvatarProps) {
  const { colors: c, isDark } = useTheme();
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const tint = personTint(name);
  const initials = personInitials(name);
  const showPhoto = Boolean(uri) && failedUri !== uri;
  const radius = size / 2;
  const fontSize = Math.round(size * (Array.from(initials).length > 1 ? 0.36 : 0.42));

  const disc = createElement(
    View,
    {
      style: [
        styles.disc,
        { width: size, height: size, borderRadius: radius, borderColor: isDark ? c.line : "rgba(23,17,41,0.06)" },
      ],
    },
    <LinearGradient
      pointerEvents="none"
      colors={[tint.from, tint.to]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.85, y: 1 }}
      style={StyleSheet.absoluteFill}
    />,
    createElement(
      NativeText,
      {
        allowFontScaling: false,
        numberOfLines: 1,
        style: [styles.initials, { color: tint.ink, fontSize, lineHeight: Math.round(fontSize * 1.2) }],
      },
      initials,
    ),
    showPhoto && uri
      ? <Image key={uri} source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setFailedUri(uri)} />
      : null,
  );

  if (!status) {
    return (
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: size, height: size }}>
        {disc}
      </View>
    );
  }

  const ring = personRingWidth(size);
  const box = personAvatarBox(size);
  const bright = ringTone === "bright";
  const ringColor = status === "owed"
    ? bright ? colors.mintBright : c.mint
    : status === "owe"
      ? bright ? colors.coralBright : c.coral
      : status === "mixed"
        ? bright ? colors.lavender : c.violet
        : "transparent";
  const badgeSize = Math.max(18, Math.round(size * 0.32));
  const rim = Math.max(2, Math.round(badgeSize * 0.12));
  // Bright mint and coral fills take night glyphs (as the dark-mode segmented pills do); deeper fills keep white.
  const glyph = bright || (isDark && status !== "mixed") ? colors.night : colors.white;

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: box, height: box }}>
      <View style={[styles.ring, { width: box, height: box, borderRadius: box / 2, borderWidth: ring, borderColor: ringColor }]}>
        {disc}
      </View>
      {badge && status !== "none" ? (
        <View
          pointerEvents="none"
          style={[
            styles.badge,
            {
              width: badgeSize + rim * 2,
              height: badgeSize + rim * 2,
              borderRadius: badgeSize / 2 + rim,
              borderWidth: rim,
              borderColor: surfaceColor ?? c.canvas,
              backgroundColor: ringColor,
              right: -rim,
              bottom: -rim,
            },
          ]}
        >
          <Icon name={BADGE_ICONS[status]} size={Math.round(badgeSize * 0.6)} color={glyph} />
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  disc: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  initials: {
    fontFamily: "Manrope_800ExtraBold",
    letterSpacing: -0.3,
    textAlign: "center",
  },
  ring: {
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
});
