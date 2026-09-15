import { StyleSheet, View } from "react-native";
import { Icon, type IconName } from "@/components/ui/Icon";
import type { CornerBadgeKind, EntryTone } from "@/features/ledger/rowCopy";
import { colors } from "@/theme/tokens";

export type { CornerBadgeKind, EntryTone } from "@/features/ledger/rowCopy";

const TONES: Record<EntryTone, { background: string; icon: string }> = {
  violet: { background: colors.violetSoft, icon: colors.violet },
  lavender: { background: colors.lavenderSoft, icon: colors.violetStrong },
  mint: { background: colors.limeSoft, icon: colors.mint },
  coral: { background: colors.coralSoft, icon: colors.coral },
  gold: { background: colors.goldSoft, icon: colors.gold },
  neutral: { background: colors.surface, icon: colors.slate },
};

const TILE_SIZES = {
  48: { radius: 16, icon: 21 },
  40: { radius: 14, icon: 18 },
} as const;

const BADGES: Record<CornerBadgeKind, { background: string; icon: IconName; size: number; color: string }> = {
  in: { background: colors.mint, icon: "arrow-down", size: 10, color: colors.white },
  out: { background: colors.coral, icon: "arrow-up", size: 10, color: colors.white },
  clock: { background: colors.goldSoft, icon: "clock", size: 11, color: colors.gold },
  check: { background: colors.mintSoft, icon: "check", size: 11, color: colors.mint },
  send: { background: colors.violetSoft, icon: "send", size: 10, color: colors.violet },
};

export type EntryTileProps = {
  icon: IconName;
  tone: EntryTone;
  /** Default 48. */
  size?: 48 | 40;
  badge?: CornerBadgeKind;
  /** The surface behind the tile, so the badge ring cuts cleanly into it. */
  ringColor: string;
};

/** Kind-tinted icon tile for ledger rows (D6). Decorative: the row's accessibility label carries the meaning. */
export function EntryTile({ icon, tone, size = 48, badge, ringColor }: EntryTileProps) {
  const palette = TONES[tone];
  const config = TILE_SIZES[size];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.tile, { width: size, height: size, borderRadius: config.radius, backgroundColor: palette.background }]}
    >
      <Icon name={icon} size={config.icon} color={palette.icon} />
      {badge ? <CornerBadge kind={badge} ringColor={ringColor} /> : null}
    </View>
  );
}

export type CornerBadgeProps = { kind: CornerBadgeKind; ringColor: string };

/** Filled direction or status badge, absolute at right −3 / bottom −3 of its parent (keeps the arrow rule, D6). */
export function CornerBadge({ kind, ringColor }: CornerBadgeProps) {
  const badge = BADGES[kind];
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.badgeRing, { backgroundColor: ringColor }]}
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
