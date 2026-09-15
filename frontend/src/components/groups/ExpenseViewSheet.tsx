import { createElement } from "react";
import { Modal, Pressable, StyleSheet, Text as NativeText, View } from "react-native";
import Animated, { FadeIn, FadeInDown, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/ui/Button";
import { useScreenObscured } from "@/components/ui/ScreenObscured";
import { TopTabs } from "@/components/ui/TopTabs";
import { defaultGroupExpenseView, groupViewFilterCount, type GroupExpenseView } from "@/features/ledger/groupLedger";
import { usePreferences } from "@/features/preferences/PreferencesProvider";
import { shadows } from "@/theme/shadows";
import { colors } from "@/theme/tokens";

type ExpenseViewSheetProps = {
  visible: boolean;
  view: GroupExpenseView;
  /** Applied immediately, so the list behind the sheet follows along. */
  onChange: (view: GroupExpenseView) => void;
  onClose: () => void;
};

const SORT_TABS = [
  { key: "recent" as const, label: "Recent" },
  { key: "largest" as const, label: "Largest" },
];

const SIDE_TABS = [
  { key: "all" as const, label: "All" },
  { key: "incoming" as const, label: "Owed to you", icon: "arrow-down" as const },
  { key: "outgoing" as const, label: "You owe", icon: "arrow-up" as const },
];

const TYPE_TABS = [
  { key: "all" as const, label: "All" },
  { key: "expense" as const, label: "Expenses" },
  { key: "payment" as const, label: "Payments" },
];

/** Sort and filter sheet for group expenses, on the ExpenseScopeModal shell (hidden while the app lock covers the screen). */
export function ExpenseViewSheet({ visible, view, onChange, onClose }: ExpenseViewSheetProps) {
  const obscured = useScreenObscured();
  const reduceMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { palette } = usePreferences();
  const changed = view.sort !== defaultGroupExpenseView.sort || groupViewFilterCount(view) > 0;

  return (
    <Modal visible={visible && !obscured} transparent animationType="fade" presentationStyle="overFullScreen" onRequestClose={onClose}>
      <View style={styles.root} accessibilityViewIsModal>
        {createElement(Pressable, { style: StyleSheet.absoluteFill, onPress: onClose, accessibilityLabel: "Close expense view options" })}
        {createElement(
          Animated.View,
          {
            entering: reduceMotion ? FadeIn.duration(140) : FadeInDown.duration(220),
            style: [styles.sheet, { backgroundColor: palette.surface, paddingBottom: Math.max(28, insets.bottom + 16) }],
          },
          <View style={styles.handle} />,
          <NativeText accessibilityRole="header" maxFontSizeMultiplier={1.3} style={styles.title}>Show expenses</NativeText>,
          <NativeText maxFontSizeMultiplier={1.4} style={styles.detail}>Choose the order and which rows to show.</NativeText>,
          <View style={styles.section}>
            <NativeText maxFontSizeMultiplier={1.3} style={styles.sectionLabel}>Sort</NativeText>
            <TopTabs tabs={SORT_TABS} value={view.sort} onChange={(sort) => onChange({ ...view, sort })} />
          </View>,
          <View style={styles.section}>
            <NativeText maxFontSizeMultiplier={1.3} style={styles.sectionLabel}>Balance</NativeText>
            <TopTabs tabs={SIDE_TABS} value={view.side} onChange={(side) => onChange({ ...view, side })} />
          </View>,
          <View style={styles.section}>
            <NativeText maxFontSizeMultiplier={1.3} style={styles.sectionLabel}>Type</NativeText>
            <TopTabs tabs={TYPE_TABS} value={view.type} onChange={(type) => onChange({ ...view, type })} />
          </View>,
          <View style={styles.actions}>
            <Button label="Reset" variant="ghost" disabled={!changed} onPress={() => onChange({ ...defaultGroupExpenseView })} />
            <View style={styles.done}>
              <Button label="Done" fullWidth onPress={onClose} />
            </View>
          </View>,
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(16,8,35,0.52)",
  },
  sheet: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 20,
    paddingTop: 12,
    ...shadows.sheet,
  },
  handle: {
    width: 42,
    height: 5,
    alignSelf: "center",
    borderRadius: 3,
    backgroundColor: colors.line,
    marginBottom: 22,
  },
  title: {
    fontFamily: "Manrope_700Bold",
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.3,
    color: colors.ink,
  },
  detail: {
    marginTop: 4,
    fontFamily: "Manrope_500Medium",
    fontSize: 13,
    lineHeight: 19,
    color: colors.slate,
  },
  section: {
    marginTop: 18,
    gap: 8,
  },
  sectionLabel: {
    fontFamily: "Manrope_700Bold",
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink,
  },
  actions: {
    marginTop: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  done: {
    flex: 1,
  },
});
