import { createElement } from "react";
import { Platform, StyleSheet, Text as NativeText, useWindowDimensions, View } from "react-native";
import Animated, { FadeIn, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { FabButton } from "@/components/ui/FabButton";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Touch } from "@/components/ui/Touch";
import { layout } from "@/theme/layout";
import { useTheme } from "@/theme/ThemeProvider";
import { colors } from "@/theme/tokens";

export type DockTab<T extends string> = { key: T; label: string; icon: IconName; activeIcon: IconName; badge?: number };

export type TabDockProps<T extends string> = {
  /** Exactly four tabs: two left of the centre button, two right. */
  tabs: readonly [DockTab<T>, DockTab<T>, DockTab<T>, DockTab<T>];
  value: T;
  onChange: (key: T) => void;
  centerAction: { label: string; hint: string; onPress: () => void };
  /** The brand shell (`useTheme().colors.shell`). Also rings the count badge. */
  barColor: string;
};

/** Height the FAB rises above the bar. */
const RISE = 31;
/** Height of the tab row (without the bottom safe area). */
const ROW = 72;
const CORNER = 28;
const FAB_SIZE = 62;
const ROW_PADDING = 8;
/** Preferred gap under the notch; it shrinks on narrow phones so each slot stays at least MIN_SLOT wide. */
const CENTER_GAP = 100;
const MIN_CENTER_GAP = 64;
const MIN_SLOT = 65;
// The bar is the dark brand shell in both themes, so the tab colours are fixed rather than themed.
const INACTIVE = "rgba(244,240,255,0.56)";
const ACTIVE_ICON = colors.lavender;
const ACTIVE_LABEL = colors.white;
/** Soft lavender pill behind the selected tab's icon, so the selection reads at a glance. */
const INDICATOR = "rgba(181,165,255,0.2)";
/** Top edge of the bar: a faint white highlight on the light canvas; a lavender hairline where the shell meets the dark canvas. */
const EDGE_LIGHT = "rgba(255,255,255,0.08)";
const EDGE_DARK = "rgba(181,165,255,0.16)";

/** ScrollView bottom padding that keeps the last content clear of the dock: 31 + 72 + max(insetBottom, 8) + 24. */
export function dockContentPadding(insetBottom: number): number {
  return RISE + ROW + Math.max(insetBottom, 8) + 24;
}

/**
 * Bar outline with the centre notch (40 deep, 124 wide at the top), shifted down by `top` so the 1pt top stroke is
 * not clipped at the SVG edge. `edgeOnly` omits the sides and bottom (used for the hairline stroke).
 */
function barPath(width: number, height: number, top: number, roundBottom: boolean, edgeOnly: boolean): string {
  const c = width / 2;
  const R = CORNER;
  const y = (value: number) => round(value + top);
  const x = round;
  const edge =
    `M0 ${y(R)} Q0 ${y(0)} ${R} ${y(0)} L${x(c - 62)} ${y(0)} ` +
    `C${x(c - 48)} ${y(0)} ${x(c - 42)} ${y(10)} ${x(c - 36)} ${y(20)} ` +
    `C${x(c - 28)} ${y(33)} ${x(c - 16)} ${y(40)} ${x(c)} ${y(40)} ` +
    `C${x(c + 16)} ${y(40)} ${x(c + 28)} ${y(33)} ${x(c + 36)} ${y(20)} ` +
    `C${x(c + 42)} ${y(10)} ${x(c + 48)} ${y(0)} ${x(c + 62)} ${y(0)} ` +
    `L${x(width - R)} ${y(0)} Q${x(width)} ${y(0)} ${x(width)} ${y(R)}`;
  if (edgeOnly) return edge;
  const bottom = roundBottom
    ? ` L${x(width)} ${y(height - R)} Q${x(width)} ${y(height)} ${x(width - R)} ${y(height)} L${R} ${y(height)} Q0 ${y(height)} 0 ${y(height - R)} Z`
    : ` L${x(width)} ${y(height)} L0 ${y(height)} Z`;
  return edge + bottom;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

/** Dark notched bottom navigation: [tab][tab] (centre Add entry) [tab][tab]. Replaces TopTabs "navigation" on the home shell. */
export function TabDock<T extends string>({ tabs, value, onChange, centerAction, barColor }: TabDockProps<T>) {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const screen = useWindowDimensions();
  const capped = Platform.OS === "web" && screen.width > layout.dockMax;
  const W = capped ? layout.dockMax : screen.width;
  const bottomInset = Math.max(insets.bottom, 8);
  const barHeight = ROW + bottomInset;
  const c = W / 2;

  // Symmetric side padding keeps the gap centred under the notch, also when a landscape inset exists on one side.
  const sidePadding = ROW_PADDING + (capped ? 0 : Math.max(insets.left, insets.right));
  const gap = Math.min(CENTER_GAP, Math.max(MIN_CENTER_GAP, W - 2 * sidePadding - 4 * MIN_SLOT));
  const halfWidth = Math.max(0, c - gap / 2);

  const [first, second, third, fourth] = tabs;
  const renderTab = (tab: DockTab<T>) => (
    <DockItem key={tab.key} tab={tab} selected={tab.key === value} barColor={barColor} onPress={() => onChange(tab.key)} />
  );

  return createElement(
    View,
    {
      pointerEvents: "box-none",
      accessibilityRole: Platform.OS === "ios" ? "tabbar" : "tablist",
      style: [
        styles.wrapper,
        { height: RISE + barHeight },
        capped ? { left: (screen.width - W) / 2, width: W } : styles.fullWidth,
      ],
    },
    // The SVG starts 1pt above the bar so the hairline on the top edge renders at full width instead of half-clipped.
    createElement(
      View,
      { pointerEvents: "none", style: [styles.bar, { top: RISE - 1, width: W, height: barHeight + 1 }] },
      <Svg width={W} height={barHeight + 1}>
        <Path d={barPath(W, barHeight, 1, capped, false)} fill={barColor} />
        <Path d={barPath(W, barHeight, 1, capped, true)} fill="none" stroke={isDark ? EDGE_DARK : EDGE_LIGHT} strokeWidth={1} />
      </Svg>,
    ),
    // Swallows taps between items so they never reach the cards scrolling behind the bar.
    createElement(View, { style: [styles.blocker, { top: RISE }] }),
    createElement(
      View,
      { pointerEvents: "box-none", style: [styles.side, { top: RISE, left: 0, width: halfWidth, paddingLeft: sidePadding }] },
      renderTab(first),
      renderTab(second),
    ),
    <FabButton
      key="center"
      size={FAB_SIZE}
      tone="violet"
      accessibilityLabel={centerAction.label}
      accessibilityHint={centerAction.hint}
      onPress={centerAction.onPress}
      containerStyle={[styles.fab, { left: c - FAB_SIZE / 2 }]}
    />,
    createElement(
      View,
      { pointerEvents: "box-none", style: [styles.side, { top: RISE, right: 0, width: halfWidth, paddingRight: sidePadding }] },
      renderTab(third),
      renderTab(fourth),
    ),
  );
}

function DockItem<T extends string>({ tab, selected, barColor, onPress }: { tab: DockTab<T>; selected: boolean; barColor: string; onPress: () => void }) {
  const reduceMotion = useReducedMotion();
  const badge = tab.badge && tab.badge > 0 ? tab.badge : 0;
  const label = badge ? `${tab.label}, ${badge} pending` : tab.label;

  // Selected: filled lavender icon on a soft pill, white bold label. Unselected: muted outline icon and label.
  const glyph = selected
    ? createElement(
      Animated.View,
      { key: "on", entering: reduceMotion ? undefined : FadeIn.duration(150), style: styles.glyph },
      createElement(View, { pointerEvents: "none", style: styles.indicator }),
      <Icon name={tab.activeIcon} size={24} color={ACTIVE_ICON} />,
    )
    : createElement(View, { key: "off", style: styles.glyph }, <Icon name={tab.icon} size={24} color={INACTIVE} />);

  return (
    <Touch
      onPress={onPress}
      containerStyle={styles.slot}
      pressableStyle={styles.item}
      pressedScale={0.92}
      haptic
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      {createElement(
        View,
        { style: styles.iconBox },
        glyph,
        badge
          ? createElement(
            View,
            { style: [styles.badge, { borderColor: barColor }] },
            createElement(NativeText, { maxFontSizeMultiplier: 1.2, style: styles.badgeLabel }, badge > 9 ? "9+" : String(badge)),
          )
          : null,
      )}
      {createElement(
        NativeText,
        {
          numberOfLines: 1,
          maxFontSizeMultiplier: 1.3,
          style: [styles.label, selected ? styles.labelSelected : styles.labelIdle],
        },
        tab.label,
      )}
    </Touch>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    bottom: 0,
    zIndex: 40,
    elevation: 20,
  },
  fullWidth: {
    left: 0,
    right: 0,
  },
  bar: {
    position: "absolute",
    left: 0,
  },
  blocker: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  side: {
    position: "absolute",
    height: ROW,
    flexDirection: "row",
  },
  fab: {
    position: "absolute",
    top: 0,
  },
  slot: {
    flex: 1,
  },
  item: {
    height: 60,
    marginTop: 6,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBox: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  glyph: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  indicator: {
    position: "absolute",
    left: -13,
    top: -3,
    width: 52,
    height: 32,
    borderRadius: 16,
    backgroundColor: INDICATOR,
  },
  label: {
    marginTop: 4,
    fontSize: 11.5,
    lineHeight: 14,
  },
  labelSelected: {
    color: ACTIVE_LABEL,
    fontFamily: "Manrope_700Bold",
  },
  labelIdle: {
    color: INACTIVE,
    fontFamily: "Manrope_600SemiBold",
  },
  badge: {
    position: "absolute",
    top: -6,
    right: -10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.coral,
  },
  badgeLabel: {
    color: colors.white,
    fontFamily: "Manrope_700Bold",
    fontSize: 10,
    lineHeight: 12,
  },
});
