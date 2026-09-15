import { StyleSheet, Text as NativeText, View } from "react-native";
import { Icon } from "@/components/ui/Icon";
import { Touch } from "@/components/ui/Touch";
import { groupViewFilterCount, type GroupExpenseView } from "@/features/ledger/groupLedger";
import { usePreferences } from "@/features/preferences/PreferencesProvider";
import { colors } from "@/theme/tokens";

const HIT_SLOP = { top: 4, bottom: 4, left: 0, right: 0 } as const;

/** "Recent" / "Largest", plus " · {n}" when filters are on. Opens the ExpenseViewSheet. */
export function ExpenseViewChip({ view, onPress }: { view: GroupExpenseView; onPress: () => void }) {
  const { palette } = usePreferences();
  const count = groupViewFilterCount(view);
  const label = `${view.sort === "largest" ? "Largest" : "Recent"}${count > 0 ? ` · ${count}` : ""}`;
  return (
    <Touch
      onPress={onPress}
      haptic
      pressedScale={0.95}
      hitSlop={HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={`Sort and filter expenses, ${label}`}
      containerStyle={styles.container}
      pressableStyle={styles.pressable}
    >
      <View style={[styles.inner, { backgroundColor: palette.surface }]}>
        <NativeText numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.label}>{label}</NativeText>
        <Icon name="chevron-down" size={16} color={colors.ink} />
      </View>
    </Touch>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: "center",
  },
  pressable: {
    minHeight: 40,
  },
  inner: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
  },
  label: {
    fontFamily: "Manrope_600SemiBold",
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink,
  },
});
