import { createElement, useState, type ReactNode } from "react";
import type { LayoutChangeEvent, ViewStyle } from "react-native";
import { StyleSheet, Text as NativeText, View } from "react-native";
import { DashedOutline } from "@/components/ui/DashedOutline";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Touch } from "@/components/ui/Touch";
import type { Palette } from "@/theme/palettes";
import { shadows } from "@/theme/shadows";
import { useTheme } from "@/theme/ThemeProvider";
import { colors } from "@/theme/tokens";

export type CategoryCardProps = {
  variant: "highlighted" | "outline" | "dashed";
  icon?: IconName;
  /** Overrides `icon` (for example `<GroupAvatar size="sm" />`). */
  leading?: ReactNode;
  meta?: string;
  title: string;
  value?: string;
  valueTone?: "positive" | "negative" | "ink";
  detail?: string;
  /** Optional status dot before `detail` (for example mint for "2 can settle now"). */
  detailDot?: "neutral" | "positive" | "warning" | "danger";
  /** tile 136×160 (Activity categories); summary flex 1, minHeight 104 (Reviews). Default "tile". */
  layout?: "tile" | "summary";
  onPress?: () => void;
  /** Chosen filter: adds a 2pt ring (white on the highlighted card, violet on the outline card) and a check on the tile. */
  selected?: boolean;
  accessibilityLabel: string;
};

const TILE = { width: 136, height: 160 } as const;
const PADDING = { tile: 16, summary: 14 } as const;
const SELECTED_RING = 2;

function valueColor(tone: NonNullable<CategoryCardProps["valueTone"]>, c: Palette) {
  return tone === "positive" ? c.mint : tone === "negative" ? c.coral : c.ink;
}

function dotColor(tone: NonNullable<CategoryCardProps["detailDot"]>, c: Palette) {
  return tone === "positive" ? c.mint : tone === "warning" ? c.gold : tone === "danger" ? c.coral : c.muted;
}

export function CategoryCard({
  variant,
  icon,
  leading,
  meta,
  title,
  value,
  valueTone = "ink",
  detail,
  detailDot,
  layout = "tile",
  onPress,
  selected = false,
  accessibilityLabel,
}: CategoryCardProps) {
  const { colors: c, isDark } = useTheme();
  const [measured, setMeasured] = useState<{ width: number; height: number } | null>(null);
  const summary = layout === "summary";
  const highlighted = variant === "highlighted";
  const dashed = variant === "dashed";
  const radius = summary ? 22 : 24;
  // Selection never rests on the fill alone: the chosen card is ringed and its tile gets a check (dashed cards are actions).
  const ringed = selected && !dashed;
  // On the dark canvas the violet-strong accent shadow reads as a glow, so it casts the theme's (black) shadow instead.
  const accentShadow = isDark ? { ...shadows.accent, shadowColor: c.shadow } : shadows.accent;

  // Box styles live on the outer view (Touch container): size, background, border and shadow.
  const box: ViewStyle[] = [
    summary ? styles.summaryBox : styles.tileBox,
    { borderRadius: radius },
    highlighted
      ? { backgroundColor: c.violet, ...accentShadow }
      : dashed
        ? {}
        : { backgroundColor: c.raised, borderWidth: 1, borderColor: c.line, ...shadows.raised },
    ...(ringed ? [{ borderWidth: SELECTED_RING, borderColor: highlighted ? "rgba(255,255,255,0.92)" : c.violet }] : []),
  ];
  // The ring is drawn inside the box, so its extra width comes out of the padding and the content never shifts.
  const ringInset = ringed ? SELECTED_RING - (highlighted ? 0 : 1) : 0;

  const onLayout = dashed && summary
    ? (event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout;
      setMeasured((current) => (current && current.width === width && current.height === height ? current : { width, height }));
    }
    : undefined;
  const outlineSize = dashed ? (summary ? measured : TILE) : null;

  const iconTile = leading ?? createElement(
    View,
    // The highlighted card's white tile sits on violet, never on the canvas, so it stays white in both themes.
    { style: [styles.iconTile, { backgroundColor: highlighted ? colors.white : c.violetSoft }] },
    <Icon name={dashed ? "plus" : icon ?? "grid"} size={19} color={highlighted ? colors.violetStrong : c.violet} />,
  );
  const tile = ringed
    ? createElement(
      View,
      null,
      iconTile,
      createElement(
        View,
        { style: [styles.checkRing, { backgroundColor: highlighted ? c.violet : c.raised }] },
        createElement(
          View,
          { style: [styles.checkInner, { backgroundColor: highlighted ? colors.white : c.violet }] },
          <Icon name="check" size={11} color={highlighted ? colors.violetStrong : colors.white} />,
        ),
      ),
    )
    : iconTile;

  const foreground = highlighted ? colors.white : c.ink;
  // Dark violet is a touch brighter, so the secondary white steps up to keep light mode's contrast.
  const secondary = highlighted ? (isDark ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.7)") : c.slate;
  // Lavender dashes would shout on the night canvas; at half strength they stay as quiet as in light mode.
  const dashColor = isDark ? "rgba(181,165,255,0.5)" : colors.lavender;

  const body = [
    outlineSize
      ? <DashedOutline key="outline" width={outlineSize.width} height={outlineSize.height} radius={radius} color={dashColor} strokeWidth={1.5} />
      : null,
    createElement(
      View,
      { key: "top", style: styles.topRow },
      tile,
      meta ? createElement(NativeText, { numberOfLines: summary ? 2 : 1, style: [styles.meta, { color: secondary }] }, meta) : null,
    ),
    createElement(
      View,
      { key: "bottom" },
      createElement(NativeText, { numberOfLines: 1, style: [styles.title, { color: foreground }] }, title),
      value
        ? createElement(NativeText, {
          numberOfLines: 1,
          adjustsFontSizeToFit: true,
          minimumFontScale: 0.7,
          style: [summary ? styles.summaryValue : styles.value, { color: highlighted ? colors.white : valueColor(valueTone, c) }],
        }, value)
        : null,
      detail
        ? createElement(
          View,
          { style: styles.detailRow },
          detailDot ? createElement(View, { style: [styles.dot, { backgroundColor: highlighted ? colors.white : dotColor(detailDot, c) }] }) : null,
          createElement(NativeText, { numberOfLines: 2, style: [styles.detail, { color: secondary }] }, detail),
        )
        : null,
    ),
  ];

  const inner = [
    styles.inner,
    summary ? styles.summaryInner : styles.tileInner,
    { borderRadius: radius },
    ringInset ? { padding: (summary ? PADDING.summary : PADDING.tile) - ringInset } : null,
  ];

  if (onPress) {
    return (
      <Touch
        onPress={onPress}
        pressedScale={0.96}
        haptic
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ selected }}
        containerStyle={box}
        pressableStyle={inner}
        onLayout={onLayout}
      >
        {body}
      </Touch>
    );
  }

  return createElement(
    View,
    { style: [box, inner], accessible: true, accessibilityLabel, onLayout },
    body,
  );
}

const styles = StyleSheet.create({
  tileBox: {
    width: TILE.width,
    height: TILE.height,
  },
  summaryBox: {
    flex: 1,
    minHeight: 104,
  },
  inner: {
    flexGrow: 1,
    justifyContent: "space-between",
  },
  tileInner: {
    padding: PADDING.tile,
  },
  summaryInner: {
    padding: PADDING.summary,
    gap: 10,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  // Same corner geometry as the ledger rows' CornerBadge: a card-coloured ring cutting into the tile.
  checkRing: {
    position: "absolute",
    right: -3,
    bottom: -3,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  checkInner: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  meta: {
    flexShrink: 1,
    textAlign: "right",
    fontFamily: "Manrope_700Bold",
    fontSize: 11,
    lineHeight: 14,
  },
  title: {
    fontFamily: "Manrope_700Bold",
    fontSize: 14,
    lineHeight: 18,
  },
  value: {
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 18,
    lineHeight: 24,
  },
  summaryValue: {
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 24,
    lineHeight: 30,
  },
  detailRow: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  detail: {
    flexShrink: 1,
    fontFamily: "Manrope_500Medium",
    fontSize: 11,
    lineHeight: 15,
  },
});
