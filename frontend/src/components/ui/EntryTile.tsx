import { StyleSheet, View } from "react-native";
import { Icon, type IconName } from "@/components/ui/Icon";
import type { CornerBadgeKind, EntryTone } from "@/features/ledger/rowCopy";
import { palettes, type Palette, type Scheme } from "@/theme/palettes";
import { useTheme } from "@/theme/ThemeProvider";
import { colors } from "@/theme/tokens";

export type { CornerBadgeKind, EntryTone } from "@/features/ledger/rowCopy";

// Soft tint + base colour per tone. In dark mode the tints are the deep themed ones; violet-strong would sink into
// the dark lavender tint, so that tone's icon turns lavender there.
function tonesFor(c: Palette, dark: boolean): Record<EntryTone, { background: string; icon: string }> {
  return {
    violet: { background: c.violetSoft, icon: c.violet },
    lavender: { background: c.lavenderSoft, icon: dark ? colors.lavender : colors.violetStrong },
    mint: { background: c.limeSoft, icon: c.mint },
    coral: { background: c.coralSoft, icon: c.coral },
    gold: { background: c.goldSoft, icon: c.gold },
    neutral: { background: c.surface, icon: c.slate },
  };
}

const TONES: Record<Scheme, Record<EntryTone, { background: string; icon: string }>> = {
  light: tonesFor(palettes.light, false),
  dark: tonesFor(palettes.dark, true),
};

const TILE_SIZES = {
  48: { radius: 16, icon: 21 },
  40: { radius: 14, icon: 18 },
} as const;

type Badge = { background: string; icon: IconName; size: number; color: string };

// Dark mode's mint and coral are bright, so the arrows on them turn night instead of white (as on the segmented pills).
function badgesFor(c: Palette, dark: boolean): Record<CornerBadgeKind, Badge> {
  const onBright = dark ? colors.night : colors.white;
  return {
    in: { background: c.mint, icon: "arrow-down", size: 10, color: onBright },
    out: { background: c.coral, icon: "arrow-up", size: 10, color: onBright },
    clock: { background: c.goldSoft, icon: "clock", size: 11, color: c.gold },
    check: { background: c.mintSoft, icon: "check", size: 11, color: c.mint },
    send: { background: c.violetSoft, icon: "send", size: 10, color: c.violet },
  };
}

const BADGES: Record<Scheme, Record<CornerBadgeKind, Badge>> = {
  light: badgesFor(palettes.light, false),
  dark: badgesFor(palettes.dark, true),
};

export type EntryTileProps = {
  icon: IconName;
  tone: EntryTone;
  /** Default 48. */
  size?: 48 | 40;
  badge?: CornerBadgeKind;
  /** The surface behind the tile, so the badge ring cuts cleanly into it. Default: the themed card colour (`raised`). */
  ringColor?: string;
};

/** Kind-tinted icon tile for ledger rows (D6). Decorative: the row's accessibility label carries the meaning. */
export function EntryTile({ icon, tone, size = 48, badge, ringColor }: EntryTileProps) {
  const { scheme } = useTheme();
  const toneColors = TONES[scheme][tone];
  const config = TILE_SIZES[size];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.tile, { width: size, height: size, borderRadius: config.radius, backgroundColor: toneColors.background }]}
    >
      <Icon name={icon} size={config.icon} color={toneColors.icon} />
      {badge ? <CornerBadge kind={badge} ringColor={ringColor} /> : null}
    </View>
  );
}

export type CornerBadgeProps = { kind: CornerBadgeKind; /** Default: the themed card colour (`raised`). */ ringColor?: string };

/** Filled direction or status badge, absolute at right −3 / bottom −3 of its parent (keeps the arrow rule, D6). */
export function CornerBadge({ kind, ringColor }: CornerBadgeProps) {
  const { scheme, colors: c } = useTheme();
  const badge = BADGES[scheme][kind];
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.badgeRing, { backgroundColor: ringColor ?? c.raised }]}
    >
      <View style={[styles.badgeInner, { backgroundColor: badge.background }]}>
        <Icon name={badge.icon} size={badge.size} color={badge.color} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: "center",
    justifyContent: "center",
  },
  badgeRing: {
    position: "absolute",
    right: -3,
    bottom: -3,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeInner: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
});
