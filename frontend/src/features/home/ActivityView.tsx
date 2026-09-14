import { useMemo, useState } from "react";
import { Alert, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/layout/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { Text } from "@/components/ui/Text";
import { TopTabs } from "@/components/ui/TopTabs";
import { useToast } from "@/components/ui/Toast";
import { useLedger } from "@/features/ledger/LedgerProvider";
import { getOpenBalanceTotals } from "@/features/ledger/selectors";
import type { TransactionDirection, TransactionItem, TransactionKind, TransactionStatus } from "@/features/ledger/types";
import { errorMessage } from "@/lib/api";
import { dateFromIso, dateToIso, formatLongDate, formatMoney, todayDate } from "@/lib/format";
import { colors } from "@/theme/tokens";

type PeriodFilter = "all" | "7d" | "30d";
type KindFilter = "all" | TransactionKind;
type DirectionFilter = "all" | TransactionDirection;
type StatusFilter = "all" | TransactionStatus;

function dayLabel(value: string) {
  if (value === todayDate()) return "Today";
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (value === dateToIso(yesterday)) return "Yesterday";
  return formatLongDate(value);
}

function TransactionRow({ item, settling, onSettle }: { item: TransactionItem; settling: boolean; onSettle: () => void }) {
  const incoming = item.direction === "incoming";
  const source = item.source === "personal" ? "Personal" : item.groupName ?? "Group";
  const person = item.source === "group" && item.kind === "expense"
    ? incoming ? "Owed back to you" : item.counterparty ? `You owe ${item.counterparty}` : "Your share"
    : item.counterparty ? incoming ? `${item.counterparty} owes you` : `You owe ${item.counterparty}` : incoming ? "Owed to you" : "You owe";
  return (
    <View className="flex-row items-center gap-3.5 border-b border-line/70 py-4 last:border-b-0">
      <View className={`h-12 w-12 items-center justify-center rounded-[17px] ${incoming ? "bg-mint-soft" : "bg-coral-soft"}`}>
        <Icon name={incoming ? "arrow-down" : "arrow-up"} size={21} color={incoming ? colors.mint : colors.coral} />
      </View>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-[15px] font-bold text-ink">{item.title}</Text>
        <Text numberOfLines={1} className="mt-1 text-xs text-slate">{person} · {source}</Text>
        <View className="mt-2 flex-row flex-wrap items-center gap-1.5">
          <View className="rounded-full border border-line px-2 py-1">
            <Text className="text-[9px] font-bold uppercase tracking-[0.7px] text-slate">{item.kind}</Text>
          </View>
          {item.status ? (
            <View className="flex-row items-center gap-1 rounded-full border border-line px-2 py-1">
              <View className={`h-1.5 w-1.5 rounded-full ${item.status === "settled" ? "bg-mint" : "bg-gold"}`} />
              <Text className="text-[9px] font-bold uppercase tracking-[0.7px] text-slate">{item.status}</Text>
            </View>
          ) : null}
          {item.source === "personal" && item.status === "open" ? <Button label="Mark settled" icon="check" size="sm" variant="secondary" loading={settling} onPress={onSettle} /> : null}
        </View>
      </View>
      <View className="items-end pl-2">
        <Text className={`text-[15px] font-bold ${incoming ? "text-mint" : "text-coral"}`}>
          {incoming ? "+" : "−"}{formatMoney(item.amountMinor, item.currency)}
        </Text>
        <Text className="mt-1 text-[9px] font-bold uppercase tracking-[0.5px] text-muted">{incoming ? "Owed to you" : "You owe"}</Text>
      </View>
    </View>
  );
}

export function ActivityView() {
  const { plan, settlePersonalTransaction } = useLedger();
  const toast = useToast();
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [period, setPeriod] = useState<PeriodFilter>("all");
  const [scope, setScope] = useState("all");
  const [kind, setKind] = useState<KindFilter>("all");
  const [direction, setDirection] = useState<DirectionFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const activeFilterCount = Number(period !== "all") + Number(scope !== "all") + Number(kind !== "all") + Number(direction !== "all") + Number(status !== "all");

  const filtered = useMemo(() => {
    const cutoff = new Date();
    if (period !== "all") cutoff.setDate(cutoff.getDate() - (period === "7d" ? 7 : 30));
    cutoff.setHours(0, 0, 0, 0);
    return plan.transactions.filter((item) => {
      if (period !== "all" && dateFromIso(item.eventDate) < cutoff) return false;
      if (scope === "personal" && item.source !== "personal") return false;
      if (scope !== "all" && scope !== "personal" && item.groupId !== scope) return false;
      if (kind !== "all" && item.kind !== kind) return false;
      if (direction !== "all" && item.direction !== direction) return false;
      if (status !== "all" && item.status !== status) return false;
      return true;
    });
  }, [direction, kind, period, plan.transactions, scope, status]);

  const sections = useMemo(() => {
    const grouped = new Map<string, TransactionItem[]>();
    for (const item of filtered) grouped.set(item.eventDate, [...(grouped.get(item.eventDate) ?? []), item]);
    return Array.from(grouped, ([date, items]) => ({ date, items })).sort((left, right) => right.date.localeCompare(left.date));
  }, [filtered]);

  const summaries = useMemo(() => {
    const totals = getOpenBalanceTotals(plan);
    return totals.length ? totals : [{ currency: "PKR", owedMinor: 0, oweMinor: 0 }];
  }, [plan.totals, plan.transactions]);

  const clearFilters = () => {
    setPeriod("all");
    setScope("all");
    setKind("all");
    setDirection("all");
    setStatus("all");
  };

  const confirmSettlement = (item: TransactionItem) => {
    Alert.alert(
      "Mark this as settled?",
      `${item.title} will leave your open balance and stay visible in Activity.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Mark settled",
          onPress: () => {
            setSettlingId(item.id);
            void settlePersonalTransaction(item.id)
              .then(() => toast.success("Marked as settled", `${item.title} left your open balance and stays in Activity.`))
              .catch((error: unknown) => toast.error("Couldn't settle the entry", errorMessage(error)))
              .finally(() => setSettlingId(null));
          },
        },
      ],
    );
  };

  return (
    <View className="gap-5 px-[18px] py-5">
      <View className="flex-row items-end justify-between gap-4">
        <View className="flex-1">
          <Text className="text-[26px] font-bold tracking-tight text-ink">Activity</Text>
          <Text className="mt-1 text-[13px] leading-5 text-slate">What you owe, what is owed to you, and what is settled.</Text>
        </View>
        <Button label={activeFilterCount ? `Filters ${activeFilterCount}` : "Filters"} icon="filter" size="sm" variant={filtersVisible || activeFilterCount ? "primary" : "secondary"} onPress={() => setFiltersVisible((current) => !current)} />
      </View>

      {summaries.map((summary) => (
        <View key={summary.currency} className="flex-row overflow-hidden rounded-[22px] border border-line bg-raised shadow-sm shadow-black/5">
          <View className="flex-1 p-4">
            <View className="flex-row items-center gap-2">
              <View className="h-8 w-8 items-center justify-center rounded-xl bg-mint-soft"><Icon name="arrow-down" size={16} color={colors.mint} /></View>
              <Text className="text-xs font-semibold text-slate">Owed to me · {summary.currency}</Text>
            </View>
            <Text className="mt-3 text-[18px] font-bold text-mint">{formatMoney(summary.owedMinor, summary.currency)}</Text>
          </View>
          <View className="w-px bg-line" />
          <View className="flex-1 p-4">
            <View className="flex-row items-center gap-2">
              <View className="h-8 w-8 items-center justify-center rounded-xl bg-coral-soft"><Icon name="arrow-up" size={16} color={colors.coral} /></View>
              <Text className="text-xs font-semibold text-slate">I owe · {summary.currency}</Text>
            </View>
            <Text className="mt-3 text-[18px] font-bold text-coral">{formatMoney(summary.oweMinor, summary.currency)}</Text>
          </View>
        </View>
      ))}

      {filtersVisible ? (
        <View className="gap-5 rounded-[22px] border border-line bg-raised p-4 shadow-sm shadow-black/5">
          <View className="flex-row items-center justify-between">
            <Text className="text-[15px] font-bold text-ink">Refine activity</Text>
            {activeFilterCount ? <Button label="Clear" variant="ghost" size="sm" onPress={clearFilters} /> : null}
          </View>
          <View className="gap-2">
            <Text className="text-xs font-bold text-slate">Date</Text>
            <TopTabs
              tabs={[
                { key: "all", label: "All time" },
                { key: "7d", label: "7 days" },
                { key: "30d", label: "30 days" },
              ]}
              value={period}
              onChange={setPeriod}
            />
          </View>
          <View className="gap-2">
            <Text className="text-xs font-bold text-slate">Source</Text>
            <View className="flex-row flex-wrap gap-2">
              <Button label="All" size="sm" variant={scope === "all" ? "primary" : "secondary"} onPress={() => setScope("all")} />
              <Button label="Personal" icon="user" size="sm" variant={scope === "personal" ? "primary" : "secondary"} onPress={() => setScope("personal")} />
              {plan.groups.map((group) => <Button key={group.id} label={group.name} icon="users" size="sm" variant={scope === group.id ? "primary" : "secondary"} onPress={() => setScope(group.id)} />)}
            </View>
          </View>
          <View className="gap-2">
            <Text className="text-xs font-bold text-slate">Type</Text>
            <View className="flex-row flex-wrap gap-2">
              {(["all", "expense", "loan", "payment"] as const).map((value) => <Button key={value} label={value === "all" ? "All" : value.charAt(0).toUpperCase() + value.slice(1)} size="sm" variant={kind === value ? "primary" : "secondary"} onPress={() => setKind(value)} />)}
            </View>
          </View>
          <View className="gap-2">
            <Text className="text-xs font-bold text-slate">Balance</Text>
            <TopTabs
              tabs={[
                { key: "all", label: "All" },
                { key: "incoming", label: "Owed to me", icon: "arrow-down" },
                { key: "outgoing", label: "I owe", icon: "arrow-up" },
              ]}
              value={direction}
              onChange={setDirection}
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
              onChange={setStatus}
            />
          </View>
        </View>
      ) : null}

      {sections.length ? sections.map((section) => (
        <View key={section.date}>
          <View className="mb-2 flex-row items-center justify-between px-1">
            <Text className="text-[13px] font-bold text-ink">{dayLabel(section.date)}</Text>
            <Text className="text-[10px] font-semibold uppercase tracking-[0.8px] text-muted">{section.items.length} {section.items.length === 1 ? "entry" : "entries"}</Text>
          </View>
          <View className="rounded-[22px] border border-line bg-raised px-4 shadow-sm shadow-black/5">
            {section.items.map((item) => <TransactionRow key={`${item.source}-${item.id}`} item={item} settling={settlingId === item.id} onSettle={() => confirmSettlement(item)} />)}
          </View>
        </View>
      )) : (
        <EmptyState
          icon="filter"
          title={plan.transactions.length ? "No matching activity" : "No balance history yet"}
          detail={plan.transactions.length ? "Try clearing one or more filters." : "Add an individual or group entry to start your history."}
          action={activeFilterCount ? { label: "Clear filters", onPress: clearFilters } : undefined}
        />
      )}
    </View>
  );
}
