import { createElement, useEffect, useRef, useState } from "react";
import type { LayoutChangeEvent, StyleProp, ViewStyle } from "react-native";
import { StyleSheet, Text as NativeText, View } from "react-native";
import Animated, { Easing, FadeIn, FadeOut, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Touch } from "@/components/ui/Touch";
import { makeStyles, useTheme } from "@/theme/ThemeProvider";
import type { Palette } from "@/theme/palettes";
import { colors } from "@/theme/tokens";

/** Colour of the selected pill in the segmented control. Use `mint`/`coral` when the choice means owed-to-you / you-owe. */
export type TabTone = "violet" | "mint" | "coral" | "gold";

type Tab<T extends string> = {
  key: T;
  label: string;
  badge?: number;
  icon?: IconName;
  /** `panel` appearance only: colour of the selected tab's icon (defaults to white). */
  accent?: string;
  /** `segmented` appearance only: colour of the selected pill (defaults to violet). */
  tone?: TabTone;
};

type TopTabsProps<T extends string> = {
  tabs: Tab<T>[];
  value: T;
  onChange: (value: T) => void;
  appearance?: "segmented" | "navigation" | "panel" | "underline";
  style?: StyleProp<ViewStyle>;
};

/** The dark floating navigation bar appearance. */
function TabItem<T extends string>({ tab, selected, onPress }: { tab: Tab<T>; selected: boolean; onPress: () => void }) {
  const foreground = selected ? colors.white : "rgba(244,240,255,0.58)";
  const selectedSurface = selected
    ? createElement(Animated.View, {
      entering: FadeIn.duration(180),
      exiting: FadeOut.duration(100),
      pointerEvents: "none",
      style: [StyleSheet.absoluteFill, styles.navigationSelection],
    })
    : null;

  return (
    <Touch
      onPress={onPress}
      containerStyle={styles.itemContainer}
      pressableStyle={[styles.item, styles.navigationItem]}
      pressedScale={0.93}
      haptic
      accessibilityRole="tab"
      accessibilityState={{ selected }}
    >
      {selectedSurface}
      {createElement(
        View,
        { style: styles.content },
        tab.icon ? <Icon name={tab.icon} size={20} color={foreground} /> : null,
        createElement(NativeText, {
          numberOfLines: 1,
          style: [styles.label, styles.navigationLabel, { color: foreground }],
        }, tab.label),
      )}
      {selected ? createElement(View, { style: styles.activeDot }) : null}
      {tab.badge ? createElement(
        View,
        { style: styles.badge },
        createElement(NativeText, { style: styles.badgeLabel }, tab.badge > 9 ? "9+" : String(tab.badge)),
      ) : null}
    </Touch>
  );
}

type PanelAppearance = "panel" | "underline";

const PANEL_MUTED = "rgba(244,240,255,0.58)";

/** Dark-surface appearances (the Activity header). Kept apart from the segmented and navigation paths so they render exactly as before (D15). */
function PanelTabItem<T extends string>({ tab, selected, appearance, onPress }: { tab: Tab<T>; selected: boolean; appearance: PanelAppearance; onPress: () => void }) {
  const panel = appearance === "panel";
  const foreground = selected ? panel ? colors.white : colors.lavender : PANEL_MUTED;
  const iconColor = selected && panel ? tab.accent ?? colors.white : foreground;
  const selection = selected
    ? createElement(Animated.View, {
      entering: FadeIn.duration(180),
      exiting: FadeOut.duration(100),
      pointerEvents: "none",
      style: panel ? [StyleSheet.absoluteFill, styles.panelSelection] : styles.underlineIndicator,
    })
    : null;

  return (
    <Touch
      onPress={onPress}
      containerStyle={styles.itemContainer}
      pressableStyle={[styles.item, panel ? styles.panelItem : styles.underlineItem]}
      pressedScale={0.93}
      haptic
      accessibilityRole="tab"
      accessibilityState={{ selected }}
    >
      {panel ? selection : null}
      {createElement(
        View,
        { style: styles.panelContent },
        tab.icon ? <Icon name={tab.icon} size={16} color={iconColor} /> : null,
        createElement(NativeText, {
          numberOfLines: 1,
          style: [
            panel ? styles.panelLabel : styles.underlineLabel,
            { color: foreground, fontFamily: selected ? "Manrope_700Bold" : "Manrope_600SemiBold" },
          ],
        }, tab.label),
      )}
      {panel ? null : selection}
      {tab.badge ? createElement(
        View,
        { style: styles.badge },
        createElement(NativeText, { style: styles.badgeLabel }, tab.badge > 9 ? "9+" : String(tab.badge)),
      ) : null}
    </Touch>
  );
}

function PanelTabs<T extends string>({ tabs, value, onChange, appearance, style }: Omit<TopTabsProps<T>, "appearance"> & { appearance: PanelAppearance }) {
  return createElement(
    View,
    {
      style: [appearance === "panel" ? styles.panelBar : styles.underlineBar, style],
      accessibilityRole: "tablist",
    },
    tabs.map((tab) => (
      <PanelTabItem key={tab.key} tab={tab} selected={tab.key === value} appearance={appearance} onPress={() => onChange(tab.key)} />
    )),
  );
}

const SEGMENT_PAD = 4;

function toneFill(tone: TabTone, palette: Palette) {
  return tone === "mint" ? palette.mint : tone === "coral" ? palette.coral : tone === "gold" ? palette.gold : palette.violet;
}

/**
 * Light surfaces: a solid pill slides under the chosen option, so the selection is obvious at a
 * glance (the old white-on-lilac pill was too close to the track). Labels switch to white on the
 * pill; in dark mode the bright mint/coral/gold pills take night text instead, which reads better.
 */
function SegmentedTabs<T extends string>({ tabs, value, onChange, style }: Omit<TopTabsProps<T>, "appearance">) {
  const { colors: theme, isDark } = useTheme();
  const themed = useSegmentedStyles();
  const reduceMotion = useReducedMotion();
  const [trackWidth, setTrackWidth] = useState(0);
  const selectedIndex = Math.max(0, tabs.findIndex((tab) => tab.key === value));
  const tone = tabs[selectedIndex]?.tone ?? "violet";
  const fill = toneFill(tone, theme);
  const onFill = tone === "violet" || !isDark ? colors.white : colors.night;
  const itemWidth = trackWidth > 0 ? (trackWidth - SEGMENT_PAD * 2) / Math.max(tabs.length, 1) : 0;
  const offset = useSharedValue(0);
  const pillColor = useSharedValue(fill);
  const placed = useRef(false);

  useEffect(() => {
    if (itemWidth <= 0) return;
    const target = selectedIndex * itemWidth;
    if (!placed.current || reduceMotion) {
      offset.value = target;
      pillColor.value = fill;
      placed.current = true;
      return;
    }
    offset.value = withTiming(target, { duration: 240, easing: Easing.out(Easing.cubic) });
    pillColor.value = withTiming(fill, { duration: 240 });
  }, [fill, itemWidth, offset, pillColor, reduceMotion, selectedIndex]);

  const pillStyle = useAnimatedStyle(() => ({
    backgroundColor: pillColor.value,
    transform: [{ translateX: offset.value }],
  }));

  return createElement(
    View,
    {
      style: [themed.bar, style],
      accessibilityRole: "tablist",
      onLayout: (event: LayoutChangeEvent) => setTrackWidth(event.nativeEvent.layout.width),
    },
    itemWidth > 0
      ? createElement(Animated.View, {
        pointerEvents: "none",
        style: [themed.pill, !isDark && { shadowColor: fill }, { width: itemWidth }, pillStyle],
      })
      : null,
    tabs.map((tab, index) => {
      const selected = index === selectedIndex && tab.key === value;
      const foreground = selected ? onFill : theme.slate;
      return (
        <Touch
          key={tab.key}
          onPress={() => onChange(tab.key)}
          containerStyle={styles.itemContainer}
          pressableStyle={[styles.item, styles.segmentedItem]}
          pressedScale={0.95}
          haptic
          accessibilityRole="tab"
          accessibilityState={{ selected }}
        >
          {createElement(
            View,
            { style: [styles.content, styles.segmentedContent] },
            tab.icon ? <Icon name={tab.icon} size={17} color={foreground} /> : null,
            createElement(NativeText, {
              numberOfLines: 1,
              style: [styles.segmentedLabel, { color: foreground, fontFamily: selected ? "Manrope_700Bold" : "Manrope_600SemiBold" }],
            }, tab.label),
          )}
          {tab.badge ? createElement(
            View,
            { style: styles.badge },
            createElement(NativeText, { style: styles.badgeLabel }, tab.badge > 9 ? "9+" : String(tab.badge)),
          ) : null}
        </Touch>
      );
    }),
  );
}

export function TopTabs<T extends string>({ tabs, value, onChange, appearance = "segmented", style }: TopTabsProps<T>) {
  if (appearance === "panel" || appearance === "underline") return <PanelTabs tabs={tabs} value={value} onChange={onChange} appearance={appearance} style={style} />;
  if (appearance === "segmented") return <SegmentedTabs tabs={tabs} value={value} onChange={onChange} style={style} />;
  return createElement(
    View,
    {
      style: [styles.navigationBar, style],
      accessibilityRole: "tablist",
    },
    tabs.map((tab) => (
      <TabItem key={tab.key} tab={tab} selected={tab.key === value} onPress={() => onChange(tab.key)} />
    )),
  );
}

const styles = StyleSheet.create({
  navigationBar: {
    minHeight: 72,
    flexDirection: "row",
    padding: 6,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.17)",
    backgroundColor: "rgba(24,14,52,0.94)",
    shadowColor: "#120A2A",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.32,
    shadowRadius: 22,
    elevation: 12,
  },
  itemContainer: {
    flex: 1,
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  navigationItem: {
    minHeight: 58,
    borderRadius: 22,
  },
  segmentedItem: {
    minHeight: 44,
    borderRadius: 15,
  },
  navigationSelection: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  content: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  segmentedContent: {
    flexDirection: "row",
    gap: 6,
  },
  label: {
    fontFamily: "Manrope_600SemiBold",
  },
  navigationLabel: {
    fontSize: 10.5,
    lineHeight: 14,
  },
  segmentedLabel: {
    fontSize: 13.5,
    lineHeight: 18,
  },
  activeDot: {
    position: "absolute",
    bottom: 5,
    width: 14,
    height: 2,
    borderRadius: 2,
    backgroundColor: colors.lavender,
  },
  badge: {
    position: "absolute",
    top: 4,
    right: 5,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: colors.coral,
    paddingHorizontal: 4,
  },
  badgeLabel: {
    color: colors.white,
    fontFamily: "Manrope_700Bold",
    fontSize: 9,
    lineHeight: 12,
  },
  panelBar: {
    minHeight: 52,
    flexDirection: "row",
    padding: 4,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  underlineBar: {
    minHeight: 44,
    flexDirection: "row",
  },
  panelItem: {
    minHeight: 44,
    borderRadius: 22,
  },
  underlineItem: {
    minHeight: 44,
    borderRadius: 12,
  },
  panelSelection: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  underlineIndicator: {
    position: "absolute",
    bottom: 5,
    left: "50%",
    marginLeft: -9,
    width: 18,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.lavender,
  },
  panelContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  panelLabel: {
    fontSize: 15,
    lineHeight: 20,
  },
  underlineLabel: {
    fontSize: 14,
    lineHeight: 20,
  },
});

const useSegmentedStyles = makeStyles((c, { isDark }) => ({
  bar: {
    minHeight: 52,
    flexDirection: "row",
    padding: SEGMENT_PAD,
    borderRadius: 18,
    backgroundColor: c.surface,
    borderWidth: isDark ? 1 : 0,
    borderColor: c.line,
  },
  pill: {
    position: "absolute",
    top: SEGMENT_PAD,
    bottom: SEGMENT_PAD,
    left: SEGMENT_PAD,
    borderRadius: 15,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: isDark ? 0 : 0.28,
    shadowRadius: 9,
    elevation: isDark ? 0 : 3,
  },
}));
