import { memo, useId, type ReactNode } from "react";
import { StyleSheet, Text as NativeText, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, ClipPath, Defs, G, LinearGradient as SvgLinearGradient, Path, Rect, Stop } from "react-native-svg";
import { router } from "expo-router";
import { clayIdPrefix } from "@/components/brand/clay-kit";
import { EmptyState } from "@/components/layout/EmptyState";
import { Button } from "@/components/ui/Button";
import { FabButton } from "@/components/ui/FabButton";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/Spinner";
import { Touch } from "@/components/ui/Touch";
import { groupSkin, type GroupSkin } from "@/features/groups/groupSkin";
import { groupPosition, type GroupPosition } from "@/features/ledger/groupLedger";
import type { Group } from "@/features/ledger/types";
import { formatMoney } from "@/lib/format";
import { shadows } from "@/theme/shadows";
import { makeStyles, useTheme } from "@/theme/ThemeProvider";
import { colors } from "@/theme/tokens";

export const CARD = { STAGE_LEFT: 76, GAP: 24, FRAME: 9, OUTER_R: 28, INNER_R: 20, PAD_TOP: 16, PAD_BOTTOM: 34 } as const;

/** Compact form card (§3.8): fixed height, shifted right so its tilted back layer stays inside the form column. */
export const COMPACT_CARD = { HEIGHT: 120, MARGIN_LEFT: 10 } as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** tab: w = clamp(col − 114, 260, 340); detail: w = clamp(col − 96, 260, 360); h = max(188, round(w × .68)). */
export function heroCardSize(columnWidth: number, detail = false): { width: number; height: number } {
  const column = Number.isFinite(columnWidth) ? columnWidth : 0;
  const width = Math.round(detail ? clamp(column - 96, 260, 360) : clamp(column - 114, 260, 340));
  return { width, height: Math.max(188, Math.round(width * 0.68)) };
}

export type CardChip = { icon: IconName; label: string; color: string };

export type LayeredGroupCardProps = {
  variant: "hero" | "compact";
  width: number;
  height: number;
  skin: GroupSkin;
  art: "full" | "muted";
  glyph: "users" | "user";
  name: string;
  currency?: string;
  /** "YOUR POSITION" | "TOTAL" */
  label: string;
  amount?: string;
  /** Replaces the label + amount block (loading / error / empty copy). */
  body?: ReactNode;
  meta?: string;
  chip?: CardChip;
  accessibilityLabel: string;
  accessibilityHint?: string;
  onPress?: () => void;
};

type Geometry = {
  frame: number;
  outerR: number;
  innerR: number;
  tilt: string;
  back: { left: number; top: number; shrinkW: number; shrinkH: number; rotate: string };
  pad: number;
  disc4: { cx: number; cy: number; r: number };
};

const GEOMETRY: Record<LayeredGroupCardProps["variant"], Geometry> = {
  hero: {
    frame: CARD.FRAME,
    outerR: CARD.OUTER_R,
    innerR: CARD.INNER_R,
    tilt: "-2deg",
    back: { left: -16, top: 8, shrinkW: 8, shrinkH: 16, rotate: "-6deg" },
    pad: 16,
    disc4: { cx: 0.86, cy: 1.1, r: 0.28 },
  },
  compact: {
    frame: 7,
    outerR: 24,
    innerR: 17,
    tilt: "-1.5deg",
    back: { left: -10, top: 6, shrinkW: 6, shrinkH: 12, rotate: "-4deg" },
    pad: 14,
    disc4: { cx: 0.86, cy: 1.25, r: 0.22 },
  },
};

/**
 * The frame around the card art. Light: a pale paper mat (raised → lavender). Dark: a lifted, slightly desaturated
 * violet rim, lighter than the art's corners and the night canvas, so the stack still reads without glowing.
 */
const FRAME_COLORS = [colors.raised, colors.lavender] as const;
const FRAME_COLORS_DARK = ["#56488D", "#35286C"] as const;
const FRAME_LOCATIONS = [0, 0.7] as const;
/** Lavender hairline where a brand surface meets the dark canvas (dark mode only). */
const DARK_HAIRLINE = "rgba(181,165,255,0.16)";
/** Neutral chip colour for informational chips ("New expense", "Needs Sara's confirmation"). */
export const CHIP_MUTED = "rgba(255,255,255,0.7)";

/** Chip colours on the dark card: mintBright owed, coralBright owe, lavender square / new (§2.24). */
export const POSITION_CHIP_COLORS: Record<GroupPosition["tone"], string> = {
  owed: colors.mintBright,
  owe: colors.coralBright,
  square: colors.lavender,
  new: colors.lavender,
};

export function positionChip(position: GroupPosition): CardChip {
  return { icon: position.icon, label: position.label, color: POSITION_CHIP_COLORS[position.tone] };
}

/**
 * Everything a hero card shows for a real group, plus its spoken label ("Weekend crew. You owe Rs 2,400. 3 members. PKR.").
 * `solo` is true when nobody but the current user is in the group.
 */
export function describeGroupCard(group: Group, hasActivity: boolean, currentUserId: string) {
  const position = groupPosition(group, hasActivity);
  const name = group.name.trim() || "Group";
  const balance = Number.isFinite(group.balanceMinor) ? Math.abs(group.balanceMinor) : 0;
  const amount = formatMoney(balance, group.currency);
  const solo = !group.members.some((member) => member.id !== currentUserId);
  const meta = solo ? "Just you" : `${group.members.length} members`;
  const spokenPosition = position.tone === "owed" || position.tone === "owe" ? `${position.label} ${amount}` : position.label;
  return {
    skin: groupSkin(group.accent),
    name,
    currency: group.currency,
    amount,
    meta,
    solo,
    position,
    chip: positionChip(position),
    accessibilityLabel: `${name}. ${spokenPosition}. ${meta}. ${group.currency}.`,
  };
}

/** Layered, tilted product card (§2.24). The tilt sits on an inner shell, never on Touch (D20). */
export const LayeredGroupCard = memo(function LayeredGroupCard(props: LayeredGroupCardProps) {
  const { variant, width, height, skin, art, glyph, name, currency, label, amount, body, meta, chip, accessibilityLabel, accessibilityHint, onPress } = props;
  const { isDark } = useTheme();
  const layerStyles = useLayerStyles();
  const geometry = GEOMETRY[variant];
  const compact = variant === "compact";
  const artWidth = Math.max(0, width - geometry.frame * 2);
  const artHeight = Math.max(0, height - geometry.frame * 2);
  const slot = { width, height };

  const topRow = (
    <View style={styles.topRow}>
      <View style={[styles.glyphTile, compact ? styles.glyphTileCompact : null]}>
        <Icon name={glyph} size={compact ? 15 : 17} color={colors.white} />
      </View>
      <NativeText numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.name, compact ? styles.nameCompact : null]}>
        {name}
        {compact && meta ? <NativeText style={styles.nameMeta}>{` · ${meta}`}</NativeText> : null}
      </NativeText>
      {currency ? (
        <View style={styles.pill}>
          <NativeText maxFontSizeMultiplier={1.2} style={styles.pillLabel}>{currency}</NativeText>
        </View>
      ) : null}
    </View>
  );

  const labelText = <NativeText numberOfLines={1} maxFontSizeMultiplier={1.3} style={compact ? styles.labelCompact : styles.label}>{label}</NativeText>;
  const amountText = amount !== undefined ? (
    <NativeText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} maxFontSizeMultiplier={1.2} style={compact ? styles.amountCompact : styles.amount}>{amount}</NativeText>
  ) : null;

  const chipView = chip ? (
    <View style={[styles.chip, compact ? styles.chipCompact : null]}>
      <Icon name={chip.icon} size={13} color={chip.color} />
      <NativeText numberOfLines={1} maxFontSizeMultiplier={1.2} style={[styles.chipLabel, { color: chip.color }]}>{chip.label}</NativeText>
    </View>
  ) : null;

  const overlay = compact ? (
    <View pointerEvents="box-none" style={[styles.overlay, { top: geometry.frame, left: geometry.frame, width: artWidth, height: artHeight, padding: geometry.pad }]}>
      {topRow}
      <View pointerEvents="box-none" style={[styles.compactBottom, { left: geometry.pad, right: geometry.pad, bottom: geometry.pad }]}>
        <View style={styles.compactValue}>
          {body ?? (
            <>
              {labelText}
              {amountText}
            </>
          )}
        </View>
        {chipView}
      </View>
    </View>
  ) : (
    <View pointerEvents="box-none" style={[styles.overlay, { top: geometry.frame, left: geometry.frame, width: artWidth, height: artHeight, padding: geometry.pad }]}>
      {topRow}
      {body ?? (
        <>
          <View style={styles.labelGap}>{labelText}</View>
          {amountText}
        </>
      )}
      {meta || chipView ? (
        <View pointerEvents="box-none" style={[styles.bottomRow, { left: geometry.pad, right: geometry.pad, bottom: geometry.pad }]}>
          {meta ? (
            <View style={styles.meta}>
              <Icon name={glyph} size={14} color="rgba(255,255,255,0.7)" />
              <NativeText numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.metaLabel}>{meta}</NativeText>
            </View>
          ) : <View />}
          {chipView}
        </View>
      ) : null}
    </View>
  );

  const layers = (
    <>
      <View
        pointerEvents="none"
        style={[
          styles.back,
          layerStyles.back,
          {
            left: geometry.back.left,
            top: geometry.back.top,
            width: Math.max(0, width - geometry.back.shrinkW),
            height: Math.max(0, height - geometry.back.shrinkH),
            borderRadius: geometry.outerR,
            transform: [{ rotate: geometry.back.rotate }],
          },
        ]}
      />
      <View pointerEvents="box-none" style={[layerStyles.shell, slot, { borderRadius: geometry.outerR, transform: [{ rotate: geometry.tilt }] }]}>
        <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.clip, { borderRadius: geometry.outerR }]}>
          <LinearGradient pointerEvents="none" colors={isDark ? FRAME_COLORS_DARK : FRAME_COLORS} locations={FRAME_LOCATIONS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <View pointerEvents="none" style={[styles.artFrame, { top: geometry.frame, left: geometry.frame, width: artWidth, height: artHeight }]}>
            <CardArt width={artWidth} height={artHeight} radius={geometry.innerR} skin={skin} muted={art === "muted"} disc4={geometry.disc4} />
          </View>
          {overlay}
        </View>
        {/* An overlay rather than a shell border, so the frame and art geometry stay identical in both themes. */}
        {isDark ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, layerStyles.rim, { borderRadius: geometry.outerR }]} /> : null}
      </View>
    </>
  );

  if (onPress) {
    return (
      <Touch
        onPress={onPress}
        containerStyle={slot}
        pressableStyle={slot}
        pressedScale={0.985}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
      >
        {layers}
      </Touch>
    );
  }

  // A static card is one accessible element, unless its body holds its own controls (the offline "Try again").
  return (
    <View style={slot} accessible={!body} accessibilityLabel={body ? undefined : accessibilityLabel}>
      {layers}
    </View>
  );
});

type CardArtProps = { width: number; height: number; radius: number; skin: GroupSkin; muted: boolean; disc4: Geometry["disc4"] };

const CardArt = memo(function CardArt({ width: w, height: h, radius, skin, muted, disc4 }: CardArtProps) {
  const prefix = clayIdPrefix(useId(), "gcard");
  if (!(w > 0) || !(h > 0)) return null;
  const clipId = `${prefix}-clip`;
  const baseId = `${prefix}-base`;
  const sheenId = `${prefix}-sheen`;
  return (
    <Svg width={w} height={h} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Defs>
        <ClipPath id={clipId}>
          <Rect x={0} y={0} width={w} height={h} rx={radius} ry={radius} />
        </ClipPath>
        <SvgLinearGradient id={baseId} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={colors.violetStrong} stopOpacity={1} />
          <Stop offset="1" stopColor={colors.plum} stopOpacity={1} />
        </SvgLinearGradient>
        <SvgLinearGradient id={sheenId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.white} stopOpacity={0.12} />
          <Stop offset="0.45" stopColor={colors.white} stopOpacity={0} />
        </SvgLinearGradient>
      </Defs>
      <G clipPath={`url(#${clipId})`} clipRule="nonzero">
        <Rect x={0} y={0} width={w} height={h} fill={`url(#${baseId})`} />
        <Circle cx={0.53 * w} cy={0.06 * h} r={0.27 * w} fill={colors.plum} />
        <Circle cx={0.84 * w} cy={0.34 * h} r={0.22 * w} fill={colors.night} fillOpacity={0.45} />
        <Circle cx={0.26 * w} cy={0.98 * h} r={0.4 * w} fill={colors.violet} fillOpacity={muted ? 0.2 : 0.38} />
        <Circle
          cx={disc4.cx * w}
          cy={disc4.cy * h}
          r={disc4.r * w}
          fill={muted ? colors.lavender : skin.disc}
          fillOpacity={muted ? 0.35 : skin.discOpacity}
        />
        <Rect x={0} y={0} width={w} height={h} fill={`url(#${sheenId})`} />
      </G>
      <Rect x={0.5} y={0.5} width={Math.max(0, w - 1)} height={Math.max(0, h - 1)} rx={Math.max(0, radius - 0.5)} ry={Math.max(0, radius - 0.5)} fill="none" stroke={colors.white} strokeOpacity={0.12} strokeWidth={1} />
    </Svg>
  );
});

/** Oversized prompt that stands in for the amount ("Start a circle"). */
export function CardPrompt({ label, text }: { label: string; text: string }) {
  return (
    <View>
      <View style={styles.labelGap}>
        <NativeText numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.label}>{label}</NativeText>
      </View>
      <NativeText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} maxFontSizeMultiplier={1.2} style={styles.prompt}>{text}</NativeText>
    </View>
  );
}

/** Loading body: light spinner plus a quiet line (13 white/70). */
export function CardLoadingBody({ label }: { label: string }) {
  return (
    <View style={styles.loadingBody}>
      <Spinner tone="light" />
      <NativeText numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.loadingLabel}>{label}</NativeText>
    </View>
  );
}

/** Offline body: coral alert, title, detail and a glass "Try again". Only use it on a card without `onPress`. */
export function CardOfflineBody({ title, detail, onRetry }: { title: string; detail: string; onRetry: () => void }) {
  return (
    <View style={styles.offlineBody}>
      <View style={styles.offlineRow}>
        <Icon name="alert-circle" size={22} color={colors.coralBright} />
        <View style={styles.offlineCopy}>
          <NativeText numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.offlineTitle}>{title}</NativeText>
          <NativeText numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.offlineDetail}>{detail}</NativeText>
        </View>
      </View>
      <View style={styles.offlineAction}>
        <Button label="Try again" variant="glass" size="sm" onPress={onRetry} />
      </View>
    </View>
  );
}

/**
 * "Needs a group" body for the group forms (expense/new, settlement/new): a muted compact card named "No group yet"
 * and an illustrated EmptyState with Create group / Add individual entry.
 */
export function FormNoGroup({ cardWidth, title, detail }: { cardWidth: number; title: string; detail: string }) {
  return (
    <View>
      <View style={styles.formCard}>
        <LayeredGroupCard
          variant="compact"
          width={cardWidth}
          height={COMPACT_CARD.HEIGHT}
          skin={groupSkin()}
          art="muted"
          glyph="users"
          name="No group yet"
          label="Total"
          amount={formatMoney(0)}
          chip={{ icon: "users", label: "Needs a group", color: colors.lavender }}
          accessibilityLabel="No group yet. Group entries need a group."
        />
      </View>
      <EmptyState
        icon="users"
        illustration="groups"
        title={title}
        detail={detail}
        action={{ label: "Create group", icon: "plus", onPress: () => router.replace("/group/new") }}
        secondaryAction={{ label: "Add individual entry", icon: "user", onPress: () => router.replace("/transaction/new") }}
      />
    </View>
  );
}

// Arc of r 40 around (44, 44) from 115° to 245°, drawn clockwise through the left side.
const CRESCENT_R = 40;
const CRESCENT_START = { x: 44 + CRESCENT_R * Math.cos((115 * Math.PI) / 180), y: 44 + CRESCENT_R * Math.sin((115 * Math.PI) / 180) };
const CRESCENT_END = { x: 44 + CRESCENT_R * Math.cos((245 * Math.PI) / 180), y: 44 + CRESCENT_R * Math.sin((245 * Math.PI) / 180) };
const CRESCENT_PATH = `M${CRESCENT_START.x.toFixed(2)} ${CRESCENT_START.y.toFixed(2)} A${CRESCENT_R} ${CRESCENT_R} 0 0 1 ${CRESCENT_END.x.toFixed(2)} ${CRESCENT_END.y.toFixed(2)}`;

/**
 * Plum floating "+" beside the stage card, with its crescent. Render it after the carousel as a sibling
 * outside the list (so it is never clipped), inside a container whose left edge is the column edge.
 */
export function StageFab({ cardHeight, onPress, accessibilityLabel }: { cardHeight: number; onPress: () => void; accessibilityLabel: string }) {
  const { isDark } = useTheme();
  const centre = CARD.PAD_TOP + cardHeight / 2;
  return (
    <>
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.crescent, { top: centre - 44 }]}
      >
        <Svg width={88} height={88}>
          {/* violetStrong disappears on the night canvas, so the dark crescent is a faint lavender line instead. */}
          <Path d={CRESCENT_PATH} fill="none" stroke={isDark ? colors.lavender : colors.violetStrong} strokeOpacity={isDark ? 0.35 : 0.45} strokeWidth={1.5} strokeLinecap="round" />
        </Svg>
      </View>
      <FabButton
        size={60}
        // Plum on the light stage; on the dark stage plum would sink into the band, so it takes the violet FAB (D5).
        tone={isDark ? "violet" : "plum"}
        onPress={onPress}
        accessibilityLabel={accessibilityLabel}
        containerStyle={[styles.fab, { top: centre - 30 }]}
      />
    </>
  );
}

/**
 * The stacked layers are the only themed part of the card: the art and everything on it stay the same deep violet
 * in both themes. In dark the pale layers become lifted violet ones edged with hairlines, and the hero shadow turns
 * black so it adds depth without a violet glow.
 */
const useLayerStyles = makeStyles((c, { isDark }) => ({
  back: isDark
    ? { backgroundColor: "rgba(125,96,255,0.2)", borderColor: "rgba(181,165,255,0.24)" }
    : { backgroundColor: "rgba(181,165,255,0.45)", borderColor: "rgba(255,255,255,0.75)" },
  shell: {
    backgroundColor: isDark ? FRAME_COLORS_DARK[1] : colors.lavender,
    ...shadows.hero,
    shadowColor: isDark ? c.shadow : shadows.hero.shadowColor,
  },
  rim: {
    borderWidth: 1,
    borderColor: DARK_HAIRLINE,
  },
}));

const styles = StyleSheet.create({
  back: {
    position: "absolute",
    borderWidth: 1,
  },
  clip: {
    overflow: "hidden",
  },
  artFrame: {
    position: "absolute",
  },
  overlay: {
    position: "absolute",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  glyphTile: {
    width: 32,
    height: 32,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  glyphTileCompact: {
    width: 28,
    height: 28,
    borderRadius: 10,
  },
  name: {
    flex: 1,
    minWidth: 0,
    fontFamily: "Manrope_700Bold",
    fontSize: 16,
    lineHeight: 20,
    color: colors.white,
  },
  nameCompact: {
    fontSize: 15,
  },
  nameMeta: {
    fontFamily: "Manrope_600SemiBold",
    fontSize: 12,
    color: "rgba(255,255,255,0.7)",
  },
  pill: {
    height: 24,
    paddingHorizontal: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  pillLabel: {
    fontFamily: "Manrope_700Bold",
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.6,
    color: "rgba(255,255,255,0.85)",
  },
  labelGap: {
    marginTop: 12,
  },
  label: {
    fontFamily: "Manrope_600SemiBold",
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.6)",
  },
  labelCompact: {
    fontFamily: "Manrope_600SemiBold",
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.6)",
  },
  amount: {
    marginTop: 2,
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.8,
    color: colors.white,
  },
  amountCompact: {
    marginTop: 1,
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.6,
    color: colors.white,
  },
  prompt: {
    marginTop: 2,
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.6,
    color: colors.white,
  },
  bottomRow: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  compactBottom: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  compactValue: {
    flex: 1,
    minWidth: 0,
  },
  meta: {
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaLabel: {
    flexShrink: 1,
    fontFamily: "Manrope_600SemiBold",
    fontSize: 12,
    lineHeight: 16,
    color: "rgba(255,255,255,0.75)",
  },
  chip: {
    height: 26,
    maxWidth: "62%",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(13,7,32,0.45)",
  },
  chipCompact: {
    marginBottom: 2,
  },
  chipLabel: {
    flexShrink: 1,
    fontFamily: "Manrope_700Bold",
    fontSize: 11,
    lineHeight: 14,
  },
  loadingBody: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  loadingLabel: {
    flexShrink: 1,
    fontFamily: "Manrope_500Medium",
    fontSize: 13,
    lineHeight: 18,
    color: "rgba(255,255,255,0.7)",
  },
  offlineBody: {
    marginTop: 14,
  },
  offlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  offlineCopy: {
    flex: 1,
    minWidth: 0,
  },
  offlineTitle: {
    fontFamily: "Manrope_700Bold",
    fontSize: 16,
    lineHeight: 20,
    color: colors.white,
  },
  offlineDetail: {
    marginTop: 2,
    fontFamily: "Manrope_500Medium",
    fontSize: 12,
    lineHeight: 16,
    color: "rgba(255,255,255,0.65)",
  },
  offlineAction: {
    marginTop: 12,
  },
  formCard: {
    marginLeft: COMPACT_CARD.MARGIN_LEFT,
    marginTop: 4,
    marginBottom: 26,
  },
  crescent: {
    position: "absolute",
    left: 13,
    width: 88,
    height: 88,
    zIndex: 2,
  },
  fab: {
    position: "absolute",
    left: 34,
    zIndex: 3,
  },
});

