import { createElement, useState, type ReactNode } from "react";
import type { LayoutChangeEvent, ViewStyle } from "react-native";
import { StyleSheet, Text as NativeText, View } from "react-native";
import { DashedOutline } from "@/components/ui/DashedOutline";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Touch } from "@/components/ui/Touch";
import { usePreferences } from "@/features/preferences/PreferencesProvider";
import { shadows } from "@/theme/shadows";
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
  selected?: boolean;
  accessibilityLabel: string;
};

const TILE = { width: 136, height: 160 } as const;

const VALUE_COLORS = { positive: colors.mint, negative: colors.coral, ink: colors.ink } as const;

const DOT_COLORS = { neutral: colors.muted, positive: colors.mint, warning: colors.gold, danger: colors.coral } as const;

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
  const { palette } = usePreferences();
  const [measured, setMeasured] = useState<{ width: number; height: number } | null>(null);
  const summary = layout === "summary";
  const highlighted = variant === "highlighted";
  const dashed = variant === "dashed";
  const radius = summary ? 22 : 24;

  // Box styles live on the outer view (Touch container): size, background, border and shadow.
  const box: ViewStyle[] = [
    summary ? styles.summaryBox : styles.tileBox,
    { borderRadius: radius },
    highlighted
      ? { backgroundColor: colors.violet, ...shadows.accent }
      : dashed
        ? {}
        : { backgroundColor: palette.surface, borderWidth: 1, borderColor: colors.line, ...shadows.raised },
  ];

  const onLayout = dashed && summary
    ? (event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout;
      setMeasured((current) => (current && current.width === width && current.height === height ? current : { width, height }));
    }
    : undefined;
  const outlineSize = dashed ? (summary ? measured : TILE) : null;

  const tile = leading ?? createElement(
    View,
    { style: [styles.iconTile, { backgroundColor: highlighted ? colors.white : colors.violetSoft }] },
    <Icon name={dashed ? "plus" : icon ?? "grid"} size={19} color={highlighted ? colors.violetStrong : colors.violet} />,
  );

  const foreground = highlighted ? colors.white : colors.ink;
  const secondary = highlighted ? "rgba(255,255,255,0.7)" : colors.slate;

  const body = [
    outlineSize
      ? <DashedOutline key="outline" width={outlineSize.width} height={outlineSize.height} radius={radius} color={colors.lavender} strokeWidth={1.5} />
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
          style: [summary ? styles.summaryValue : styles.value, { color: highlighted ? colors.white : VALUE_COLORS[valueTone] }],
        }, value)
        : null,
      detail
        ? createElement(
          View,
          { style: styles.detailRow },
          detailDot ? createElement(View, { style: [styles.dot, { backgroundColor: highlighted ? colors.white : DOT_COLORS[detailDot] }] }) : null,
          createElement(NativeText, { numberOfLines: 2, style: [styles.detail, { color: secondary }] }, detail),
        )
        : null,
    ),
  ];

  const inner = [styles.inner, summary ? styles.summaryInner : styles.tileInner, { borderRadius: radius }];

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
    padding: 16,
  },
  summaryInner: {
    padding: 14,
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
