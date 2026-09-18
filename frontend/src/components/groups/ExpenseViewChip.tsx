import { Text as NativeText, View } from "react-native";
import { Icon } from "@/components/ui/Icon";
import { Touch } from "@/components/ui/Touch";
import { defaultGroupExpenseView, groupViewFilterCount, type GroupExpenseView } from "@/features/ledger/groupLedger";
import { makeStyles, useTheme } from "@/theme/ThemeProvider";
import { colors } from "@/theme/tokens";

const HIT_SLOP = { top: 4, bottom: 4, left: 0, right: 0 } as const;

/**
 * "Recent" / "Largest", plus " · {n}" when filters are on. Opens the ExpenseViewSheet.
 * While the view differs from the default (the sheet's Reset is enabled) the chip wears a violet ring and label,
 * so a filtered list never looks like the full one.
 */
export function ExpenseViewChip({ view, onPress }: { view: GroupExpenseView; onPress: () => void }) {
  const styles = useStyles();
  const { colors: c, isDark } = useTheme();
  const count = groupViewFilterCount(view);
  const active = count > 0 || view.sort !== defaultGroupExpenseView.sort;
  const label = `${view.sort === "largest" ? "Largest" : "Recent"}${count > 0 ? ` · ${count}` : ""}`;
  // violetStrong reads 8:1 on the light violet tint; lavender 6.5:1 on the dark one.
  const activeColor = isDark ? colors.lavender : colors.violetStrong;
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
      <View style={[styles.inner, active ? styles.innerActive : null]}>
        <NativeText numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.label, active ? { color: activeColor } : null]}>{label}</NativeText>
        <Icon name="chevron-down" size={16} color={active ? activeColor : c.ink} />
      </View>
    </Touch>
  );
}

const useStyles = makeStyles((c) => ({
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
    borderColor: c.line,
    backgroundColor: c.raised,
  },
  innerActive: {
    // 1.5pt so the ring reads as a state, not a hairline; padding trims by the extra half point to keep the size.
    borderWidth: 1.5,
    paddingHorizontal: 11.5,
    borderColor: c.violet,
    backgroundColor: c.violetSoft,
  },
  label: {
    fontFamily: "Manrope_600SemiBold",
    fontSize: 13,
    lineHeight: 18,
    color: c.ink,
  },
}));
