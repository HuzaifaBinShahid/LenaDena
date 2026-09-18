import { createElement } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text as NativeText, View } from "react-native";
import Animated, { FadeIn, FadeInDown, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/ui/Button";
import { useScreenObscured } from "@/components/ui/ScreenObscured";
import { Text } from "@/components/ui/Text";
import { TopTabs } from "@/components/ui/TopTabs";
import type { ActivityPeriod } from "@/features/ledger/activity";
import type { Group, TransactionDirection, TransactionKind, TransactionStatus } from "@/features/ledger/types";
import { makeStyles } from "@/theme/ThemeProvider";

export type BalanceChoice = TransactionDirection | "both";

export type ActivityFilterSheetProps = {
  visible: boolean;
  onClose: () => void;
  period: ActivityPeriod;
  onPeriodChange: (period: ActivityPeriod) => void;
  scope: string;
  onScopeChange: (scope: string) => void;
  kind: "all" | TransactionKind;
  onKindChange: (kind: "all" | TransactionKind) => void;
  status: "all" | TransactionStatus;
  onStatusChange: (status: "all" | TransactionStatus) => void;
  /** `listSides === "both" ? "both" : side`. */
  balance: BalanceChoice;
  /** Choosing a side sets the panel side and lists only that side; "both" lists both again. */
  onBalanceChange: (balance: BalanceChoice) => void;
  groups: Group[];
  /** Source + type + status + a chosen list side. Shows "Clear" when above 0. */
  activeCount: number;
  /** Entries the history list will show with these filters. */
  resultCount: number;
  /** Resets scope, kind, status and the list side only. */
  onClear: () => void;
};

const KIND_OPTIONS = ["all", "expense", "loan", "payment"] as const;

/** Refine activity: the ExpenseScopeModal shell (bottom sheet over a dimmed backdrop) with the existing filter controls. */
export function ActivityFilterSheet({
  visible,
  onClose,
  period,
  onPeriodChange,
  scope,
  onScopeChange,
  kind,
  onKindChange,
  status,
  onStatusChange,
  balance,
  onBalanceChange,
  groups,
  activeCount,
  resultCount,
  onClear,
}: ActivityFilterSheetProps) {
  const obscured = useScreenObscured();
  const reduceMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const styles = useStyles();

  const footerLabel = resultCount === 0 ? "Close" : `Show ${resultCount} ${resultCount === 1 ? "entry" : "entries"}`;

  const sheet = createElement(
    Animated.View,
    {
      entering: reduceMotion ? FadeIn.duration(140) : FadeInDown.duration(220),
      style: [styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) + 8 }],
    },
    <View style={styles.handle} />,
    <View style={styles.header}>
      {createElement(NativeText, { accessibilityRole: "header", style: styles.title, numberOfLines: 1 }, "Refine activity")}
      {activeCount > 0 ? <Button label="Clear" variant="ghost" size="sm" onPress={onClear} accessibilityHint="Resets source, type, balance and status" /> : null}
    </View>,
    <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View className="gap-2">
        <Text className="text-xs font-bold text-slate">Date</Text>
        <TopTabs
          tabs={[
            { key: "week", label: "Week" },
            { key: "month", label: "Month" },
            { key: "year", label: "Year" },
            { key: "all", label: "All time" },
          ]}
          value={period}
          onChange={onPeriodChange}
        />
      </View>
      <View className="gap-2">
        <Text className="text-xs font-bold text-slate">Source</Text>
        <View className="flex-row flex-wrap gap-2">
          <Button label="All" size="sm" variant={scope === "all" ? "primary" : "secondary"} onPress={() => onScopeChange("all")} />
          <Button label="Personal" icon="user" size="sm" variant={scope === "personal" ? "primary" : "secondary"} onPress={() => onScopeChange("personal")} />
          {groups.map((group) => (
            <Button key={group.id} label={group.name} icon="users" size="sm" variant={scope === group.id ? "primary" : "secondary"} onPress={() => onScopeChange(group.id)} />
          ))}
        </View>
      </View>
      <View className="gap-2">
        <Text className="text-xs font-bold text-slate">Type</Text>
        <View className="flex-row flex-wrap gap-2">
          {KIND_OPTIONS.map((value) => (
            <Button
              key={value}
              label={value === "all" ? "All" : value.charAt(0).toUpperCase() + value.slice(1)}
              size="sm"
              variant={kind === value ? "primary" : "secondary"}
              onPress={() => onKindChange(value)}
            />
          ))}
        </View>
      </View>
      <View className="gap-2">
        <Text className="text-xs font-bold text-slate">Balance</Text>
        <TopTabs
          tabs={[
            { key: "incoming", label: "Owed to me", icon: "arrow-down", tone: "mint" },
            { key: "outgoing", label: "I owe", icon: "arrow-up", tone: "coral" },
            { key: "both", label: "Both sides" },
          ]}
          value={balance}
          onChange={onBalanceChange}
        />
      </View>
      <View className="gap-2">
        <Text className="text-xs font-bold text-slate">Status</Text>
        <TopTabs
          tabs={[
            { key: "all", label: "All" },
            { key: "open", label: "Open" },
            { key: "settled", label: "Settled", icon: "check" },
          ]}
          value={status}
          onChange={onStatusChange}
        />
        {createElement(NativeText, { style: styles.hint }, "Open and settled apply to individual entries. Group history has no status.")}
      </View>
    </ScrollView>,
    <View style={styles.footer}>
      <Button label={footerLabel} fullWidth onPress={onClose} />
    </View>,
  );

  return (
    <Modal visible={visible && !obscured} transparent animationType="fade" presentationStyle="overFullScreen" onRequestClose={onClose}>
      <View style={styles.root} accessibilityViewIsModal>
        {createElement(Pressable, { style: StyleSheet.absoluteFill, onPress: onClose, accessibilityRole: "button", accessibilityLabel: "Close filters" })}
        {sheet}
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  root: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: c.backdrop,
  },
  sheet: {
    maxHeight: "86%",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    // The line border doubles as the sheet's top hairline in dark mode, where the shadow disappears.
    borderWidth: 1,
    borderColor: c.line,
    backgroundColor: c.raised,
    paddingHorizontal: 20,
    paddingTop: 12,
    shadowColor: c.shadow,
    shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
  },
  handle: {
    width: 42,
    height: 5,
    alignSelf: "center",
    borderRadius: 3,
    backgroundColor: c.line,
    marginBottom: 22,
  },
  header: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  title: {
    flexShrink: 1,
    fontFamily: "Manrope_700Bold",
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.3,
    color: c.ink,
  },
  body: {
    flexGrow: 0,
    flexShrink: 1,
    marginTop: 18,
  },
  bodyContent: {
    gap: 22,
    paddingBottom: 20,
  },
  hint: {
    fontFamily: "Manrope_500Medium",
    fontSize: 12,
    lineHeight: 16,
    color: c.slate,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: c.line,
    paddingTop: 16,
  },
}));
