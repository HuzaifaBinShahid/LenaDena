import { createElement } from "react";
import { Text as NativeText, View } from "react-native";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
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

/** Refine activity: an expandable BottomSheet (drag the handle or title to expand, collapse or dismiss) with the filter controls. */
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
  const styles = useStyles();

  const footerLabel = resultCount === 0 ? "Close" : `Show ${resultCount} ${resultCount === 1 ? "entry" : "entries"}`;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Refine activity"
      expandable
      bodyContentStyle={styles.bodyContent}
      header={
        <View style={styles.header}>
          {createElement(NativeText, { accessibilityRole: "header", style: styles.title, numberOfLines: 1 }, "Refine activity")}
          {activeCount > 0 ? <Button label="Clear" variant="ghost" size="sm" onPress={onClear} accessibilityHint="Resets source, type, balance and status" /> : null}
        </View>
      }
      footer={
        <View style={styles.footer}>
          <Button label={footerLabel} fullWidth onPress={onClose} />
        </View>
      }
    >
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
    </BottomSheet>
  );
}

const useStyles = makeStyles((c) => ({
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
  bodyContent: {
    gap: 22,
    paddingTop: 18,
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
