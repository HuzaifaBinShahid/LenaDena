import { createElement } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, Text as NativeText, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Touch } from "@/components/ui/Touch";
import { colors } from "@/theme/tokens";

type Tab<T extends string> = {
  key: T;
  label: string;
  badge?: number;
  icon?: IconName;
  /** `panel` appearance only: colour of the selected tab's icon (defaults to white). */
  accent?: string;
};

type TopTabsProps<T extends string> = {
  tabs: Tab<T>[];
  value: T;
  onChange: (value: T) => void;
  appearance?: "segmented" | "navigation" | "panel" | "underline";
  style?: StyleProp<ViewStyle>;
};

function TabItem<T extends string>({ tab, selected, appearance, onPress }: { tab: Tab<T>; selected: boolean; appearance: "segmented" | "navigation"; onPress: () => void }) {
  const navigation = appearance === "navigation";
  const foreground = selected ? navigation ? colors.white : colors.ink : navigation ? "rgba(244,240,255,0.58)" : colors.slate;
  const selectedSurface = selected
    ? createElement(Animated.View, {
      entering: FadeIn.duration(180),
      exiting: FadeOut.duration(100),
      pointerEvents: "none",
      style: [StyleSheet.absoluteFill, navigation ? styles.navigationSelection : styles.segmentedSelection],
    })
    : null;

  return (
    <Touch
      onPress={onPress}
      containerStyle={styles.itemContainer}
      pressableStyle={[styles.item, navigation ? styles.navigationItem : styles.segmentedItem]}
      pressedScale={0.93}
      haptic
      accessibilityRole="tab"
      accessibilityState={{ selected }}
    >
      {selectedSurface}
      {createElement(
        View,
        { style: [styles.content, !navigation && styles.segmentedContent] },
        tab.icon ? <Icon name={tab.icon} size={navigation ? 20 : 17} color={foreground} /> : null,
        createElement(NativeText, {
          numberOfLines: 1,
          style: [styles.label, navigation ? styles.navigationLabel : styles.segmentedLabel, { color: foreground }],
        }, tab.label),
      )}
      {navigation && selected ? createElement(View, { style: styles.activeDot }) : null}
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

/** Dark-surface appearances. Kept apart from `TabItem` so the segmented and navigation paths render exactly as before (D15). */
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

export function TopTabs<T extends string>({ tabs, value, onChange, appearance = "segmented", style }: TopTabsProps<T>) {
  if (appearance === "panel" || appearance === "underline") return <PanelTabs tabs={tabs} value={value} onChange={onChange} appearance={appearance} style={style} />;
  const navigation = appearance === "navigation";
  return createElement(
    View,
    {
      style: [navigation ? styles.navigationBar : styles.segmentedBar, style],
      accessibilityRole: "tablist",
    },
    tabs.map((tab) => (
      <TabItem key={tab.key} tab={tab} selected={tab.key === value} appearance={appearance} onPress={() => onChange(tab.key)} />
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
  segmentedBar: {
    minHeight: 52,
    flexDirection: "row",
    padding: 4,
    borderRadius: 18,
    backgroundColor: colors.surface,
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
  segmentedSelection: {
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(112,76,245,0.12)",
    backgroundColor: colors.raised,
    shadowColor: colors.violetStrong,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
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
    fontSize: 13,
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
