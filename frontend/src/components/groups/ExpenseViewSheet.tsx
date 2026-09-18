import { Text as NativeText, View } from "react-native";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { TopTabs } from "@/components/ui/TopTabs";
import { defaultGroupExpenseView, groupViewFilterCount, type GroupExpenseView } from "@/features/ledger/groupLedger";
import { makeStyles } from "@/theme/ThemeProvider";

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

// The pill takes the money colour of the side it shows: mint for money coming to you, coral for money you owe.
const SIDE_TABS = [
  { key: "all" as const, label: "All" },
  { key: "incoming" as const, label: "Owed to you", icon: "arrow-down" as const, tone: "mint" as const },
  { key: "outgoing" as const, label: "You owe", icon: "arrow-up" as const, tone: "coral" as const },
];

const TYPE_TABS = [
  { key: "all" as const, label: "All" },
  { key: "expense" as const, label: "Expenses" },
  { key: "payment" as const, label: "Payments" },
];

/** Sort and filter sheet for group expenses: an expandable BottomSheet, like Refine activity. */
export function ExpenseViewSheet({ visible, view, onChange, onClose }: ExpenseViewSheetProps) {
  const styles = useStyles();
  const changed = view.sort !== defaultGroupExpenseView.sort || groupViewFilterCount(view) > 0;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Show expenses"
      expandable
      bodyContentStyle={styles.bodyContent}
      header={
        <View>
          <NativeText accessibilityRole="header" maxFontSizeMultiplier={1.3} style={styles.title}>Show expenses</NativeText>
          <NativeText maxFontSizeMultiplier={1.4} style={styles.detail}>Choose the order and which rows to show.</NativeText>
        </View>
      }
      footer={
        <View style={styles.actions}>
          <Button label="Reset" variant="ghost" disabled={!changed} onPress={() => onChange({ ...defaultGroupExpenseView })} />
          <View style={styles.done}>
            <Button label="Done" fullWidth onPress={onClose} />
          </View>
        </View>
      }
    >
      <View style={styles.section}>
        <NativeText maxFontSizeMultiplier={1.3} style={styles.sectionLabel}>Sort</NativeText>
        <TopTabs tabs={SORT_TABS} value={view.sort} onChange={(sort) => onChange({ ...view, sort })} />
      </View>
      <View style={styles.section}>
        <NativeText maxFontSizeMultiplier={1.3} style={styles.sectionLabel}>Balance</NativeText>
        <TopTabs tabs={SIDE_TABS} value={view.side} onChange={(side) => onChange({ ...view, side })} />
      </View>
      <View style={styles.section}>
        <NativeText maxFontSizeMultiplier={1.3} style={styles.sectionLabel}>Type</NativeText>
        <TopTabs tabs={TYPE_TABS} value={view.type} onChange={(type) => onChange({ ...view, type })} />
      </View>
    </BottomSheet>
  );
}

const useStyles = makeStyles((c) => ({
  title: {
    fontFamily: "Manrope_700Bold",
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.3,
    color: c.ink,
  },
  detail: {
    marginTop: 4,
    fontFamily: "Manrope_500Medium",
    fontSize: 13,
    lineHeight: 19,
    color: c.slate,
  },
  bodyContent: {
    gap: 18,
    paddingTop: 18,
    paddingBottom: 20,
  },
  section: {
    gap: 8,
  },
  sectionLabel: {
    fontFamily: "Manrope_700Bold",
    fontSize: 13,
    lineHeight: 18,
    color: c.ink,
  },
  actions: {
    paddingTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  done: {
    flex: 1,
  },
}));
