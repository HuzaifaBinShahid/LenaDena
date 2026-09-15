import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LayoutChangeEvent } from "react-native";
import { Alert, AppState, ScrollView, StyleSheet, Text as NativeText, useWindowDimensions, View } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn, useReducedMotion } from "react-native-reanimated";
import { AreaChart, CHART, type AreaChartProps } from "@/components/charts/AreaChart";
import { EmptyState } from "@/components/layout/EmptyState";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { Button } from "@/components/ui/Button";
import { CategoryCard } from "@/components/ui/CategoryCard";
import { EntryTile } from "@/components/ui/EntryTile";
import { GroupAvatar } from "@/components/ui/GroupAvatar";
import { Icon } from "@/components/ui/Icon";
import { LedgerList, LedgerRow } from "@/components/ui/LedgerRow";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { TopTabs } from "@/components/ui/TopTabs";
import { Touch } from "@/components/ui/Touch";
import { ActivityFilterSheet, type BalanceChoice } from "@/features/home/ActivityFilterSheet";
import type { HomeTabProps } from "@/features/home/tab-props";
import {
  activeFilterCount,
  bucketSeries,
  buildBuckets,
  buildCategories,
  chartFilterCount,
  chartItems,
  fallbackCategories,
  filterList,
  getSideBalance,
  groupByDay,
  listCurrencies,
  olderEntryCount,
  otherCurrencyWithData,
  periodPhrase,
  resolveCurrency,
  type ActivityPeriod,
  type ActivityQuery,
  type Category,
} from "@/features/ledger/activity";
import { useLedger } from "@/features/ledger/LedgerProvider";
import { getPlanState } from "@/features/ledger/planState";
import { describeTransaction } from "@/features/ledger/rowCopy";
import type { TransactionDirection, TransactionItem, TransactionKind, TransactionStatus } from "@/features/ledger/types";
import { usePreferences } from "@/features/preferences/PreferencesProvider";
import { errorMessage } from "@/lib/api";
import { chartX } from "@/lib/curve";
import { formatMoney, formatSignedMoney, relativeDayLabel, todayDate } from "@/lib/format";
import { layout } from "@/theme/layout";
import { colors } from "@/theme/tokens";

const AXIS = { height: 32, labelWidth: 44, selectedWidth: 96, clearance: 70 } as const;
const CATEGORY_SNAP = 148;

const PERIOD_TABS: { key: ActivityPeriod; label: string }[] = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
  { key: "all", label: "All" },
];

const SIDE_TABS: { key: TransactionDirection; label: string; icon: "arrow-down" | "arrow-up"; accent: string }[] = [
  { key: "incoming", label: "Owed to me", icon: "arrow-down", accent: colors.mintBright },
  { key: "outgoing", label: "I owe", icon: "arrow-up", accent: colors.coralBright },
];

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/** "in the last 30 days" | "over all time". */
function windowIn(period: ActivityPeriod) {
  return period === "all" ? "over all time" : `in the ${periodPhrase(period)}`;
}

/** Detail under "Nothing new owed to you": nudges toward a longer window. */
function widerWindowHint(period: ActivityPeriod) {
  if (period === "week") return "In the last 7 days. Try Month or Year.";
  if (period === "month") return "In the last 30 days. Try Year or All.";
  if (period === "year") return "In the last 12 months. Try All.";
  return "Nothing recorded on this side yet.";
}

function isGroupScope(scope: string) {
  return scope !== "all" && scope !== "personal";
}

export function ActivityView({ onAddEntry }: HomeTabProps) {
  const { plan, connection, refresh, settlePersonalTransaction } = useLedger();
  const { palette } = usePreferences();
  const toast = useToast();
  const reduceMotion = useReducedMotion();
  const { width: windowWidth } = useWindowDimensions();
  const col = Math.min(windowWidth, layout.contentMax);

  const [side, setSide] = useState<TransactionDirection>("incoming");
  const [listSides, setListSides] = useState<"both" | "side">("both");
  const [period, setPeriod] = useState<ActivityPeriod>("month");
  const [scope, setScope] = useState<string>("all");
  const [kind, setKind] = useState<"all" | TransactionKind>("all");
  const [status, setStatus] = useState<"all" | TransactionStatus>("all");
  const [currencyChoice, setCurrencyChoice] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ key: string; index: number } | null>(null);
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [today, setToday] = useState(todayDate);
  const [chartWidth, setChartWidth] = useState(0);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") setToday(todayDate());
    });
    return () => subscription.remove();
  }, []);

  const planState = getPlanState(plan, connection);
  const loading = planState === "loading";
  const offline = planState === "offline";
  const unavailable = loading || offline;
  const noTransactions = !unavailable && plan.transactions.length === 0;

  const currencies = useMemo(() => listCurrencies(plan), [plan]);
  const currency = resolveCurrency(plan, { scope, side, preferred: currencyChoice });
  const groupScope = isGroupScope(scope);
  const scopeName = scope === "personal" ? "Personal" : groupScope ? plan.groups.find((group) => group.id === scope)?.name ?? "Group" : null;

  const query = useMemo<ActivityQuery>(
    () => ({ side, listSides, period, scope, kind, status, currency, today }),
    [side, listSides, period, scope, kind, status, currency, today],
  );

  const buckets = useMemo(() => buildBuckets(plan, period, today), [plan, period, today]);
  const series = useMemo(() => bucketSeries(chartItems(plan, query), buckets, today), [plan, query, buckets, today]);
  const listItems = useMemo(() => filterList(plan, query), [plan, query]);
  const days = useMemo(() => groupByDay(listItems), [listItems]);
  const categories = useMemo<Category[]>(() => {
    const built = buildCategories(plan, query);
    return built.length ? built : fallbackCategories(plan, query);
  }, [plan, query]);
  const filterCount = activeFilterCount(query);
  const olderCount = useMemo(() => olderEntryCount(plan, query), [plan, query]);
  const balance = getSideBalance(plan, side, currency, scope);
  const phrase = periodPhrase(period);
  const incoming = side === "incoming";
  const showCurrencyPills = !unavailable && currencies.length >= 2 && !groupScope;

  // Selection belongs to one query; any change of side, window, currency or filter snaps back to the peak.
  const queryKey = [side, period, currency, scope, kind, status].join("|");
  const count = series.values.length;
  const rawIndex = selection?.key === queryKey ? selection.index : series.peakIndex;
  const activeIndex = rawIndex === null || count === 0 ? null : Math.min(count - 1, Math.max(0, rawIndex));

  const latest = useRef({ queryKey, activeIndex });
  latest.current = { queryKey, activeIndex };
  const onSelectBucket = useCallback((index: number) => {
    const current = latest.current;
    if (index === current.activeIndex) return;
    setSelection({ key: current.queryKey, index });
    void Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const onColumnLayout = (event: LayoutChangeEvent) => {
    const width = Math.round(event.nativeEvent.layout.width * 10) / 10;
    setChartWidth((current) => (current === width ? current : width));
  };

  const changeSide = (next: TransactionDirection) => {
    if (next === side) return;
    // Keep the chart currency steady across the switch instead of re-resolving it for the other side.
    if (currencies.length >= 2 && !groupScope) setCurrencyChoice(currency);
    setSide(next);
  };

  const changeBalance = (value: BalanceChoice) => {
    if (value === "both") {
      setListSides("both");
      return;
    }
    changeSide(value);
    setListSides("side");
  };

  const clearFilters = () => {
    setScope("all");
    setKind("all");
    setStatus("all");
    setListSides("both");
  };

  const toggleScope = (key: string) => setScope((current) => (current === key ? "all" : key));

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

  // ---------------------------------------------------------------------------
  // Chart state and overlay (loading / offline / A no transactions / C filters / B empty window)
  // ---------------------------------------------------------------------------
  const chartEmpty = series.totalMinor <= 0;
  let chartState: AreaChartProps["state"] = "ready";
  let overlay: AreaChartProps["overlay"];
  if (loading) {
    chartState = "loading";
  } else if (offline) {
    chartState = "flat";
    overlay = { icon: "alert-circle", title: "Can't reach LenaDena", detail: "Pull your history again when you're back online." };
  } else if (noTransactions) {
    chartState = "flat";
    overlay = { icon: "pulse", title: "No activity yet", detail: "Entries you add will draw your balance history here." };
  } else if (chartEmpty && chartFilterCount(query) > 0) {
    // C: filters leave nothing to chart. When the list still shows the other side, say which side is empty.
    const where = period === "all" ? "yet" : `in the ${phrase}`;
    chartState = "flat";
    overlay = listItems.length === 0
      ? { icon: "filter", title: "No matches", detail: `Nothing matches these filters ${where}.` }
      : {
        icon: "filter",
        title: incoming ? "Nothing new owed to you" : "Nothing new that you owe",
        detail: `Nothing on this side matches these filters ${where}.`,
      };
  } else if (chartEmpty) {
    const other = showCurrencyPills ? otherCurrencyWithData(plan, query) : null;
    chartState = "flat";
    overlay = {
      icon: "calendar",
      title: incoming ? "Nothing new owed to you" : "Nothing new that you owe",
      detail: other
        ? period === "all"
          ? `No ${currency} entries on this side yet. Switch to ${other} above.`
          : `No ${currency} entries in the ${phrase}. Switch to ${other} above.`
        : widerWindowHint(period),
    };
  }
  const chartReady = chartState === "ready";
  const activeBucket = activeIndex === null ? undefined : buckets[activeIndex];
  const activeValue = activeIndex === null ? 0 : series.values[activeIndex] ?? 0;
  const tooltip = chartReady && activeIndex !== null ? formatMoney(activeValue, currency) : null;

  const verb = kind === "payment" ? (incoming ? "Paid to you" : "You paid") : "Added";

  // ---------------------------------------------------------------------------
  // Panel
  // ---------------------------------------------------------------------------
  const balanceLabel = noTransactions && balance === 0
    ? incoming ? "Nothing owed to you yet" : "You don't owe anyone yet"
    : incoming ? "Owed to you now" : "You owe now";

  const balanceText = `${balanceLabel}${scopeName ? ` · ${scopeName}` : ""}`;
  const balanceA11y = loading
    ? `${balanceText}, loading`
    : offline
      ? `${balanceText}, unavailable offline`
      : `${balanceText}, ${formatMoney(balance, currency)}`;

  const headline = unavailable
    ? createElement(View, { key: "bar", style: styles.headlineBar })
    : createElement(
      Animated.View,
      { key: `${side}|${currency}|${scope}`, entering: reduceMotion ? undefined : FadeIn.duration(160) },
      createElement(NativeText, {
        numberOfLines: 1,
        adjustsFontSizeToFit: true,
        minimumFontScale: 0.7,
        style: styles.headline,
      }, formatMoney(balance, currency)),
    );

  const currencyLine = loading
    ? "Loading your balances"
    : offline
      ? "Balances unavailable offline"
      : scope === "all"
        ? `${currency} · groups and individual entries`
        : scope === "personal"
          ? `${currency} · individual entries`
          : `${scopeName ?? "Group"} · ${currency}`;

  const currencyRow = showCurrencyPills
    ? createElement(
      View,
      { style: styles.pills },
      currencies.map((code) => {
        const selected = code === currency;
        return (
          <Touch
            key={code}
            onPress={() => setCurrencyChoice(code)}
            hitSlop={6}
            haptic
            pressedScale={0.94}
            accessibilityRole="button"
            accessibilityLabel={`Show ${code} balances`}
            accessibilityState={{ selected }}
            pressableStyle={[styles.pill, selected ? styles.pillSelected : styles.pillIdle]}
          >
            {createElement(NativeText, { style: [styles.pillLabel, { color: selected ? colors.white : "rgba(255,255,255,0.6)" }] }, code)}
          </Touch>
        );
      }),
    )
    : createElement(NativeText, { numberOfLines: 1, style: styles.currencyLine }, currencyLine);

  const filterButton = (
    <Touch
      onPress={() => setSheetVisible(true)}
      haptic
      pressedScale={0.92}
      accessibilityRole="button"
      accessibilityLabel={filterCount > 0 ? `Filters, ${filterCount} active` : "Filters"}
      accessibilityHint="Refine by date, source, type, balance and status"
      pressableStyle={styles.filterButton}
    >
      <Icon name="filter" size={19} color={colors.violetStrong} />
      {filterCount > 0
        ? createElement(
          View,
          { style: styles.filterBadge, pointerEvents: "none" },
          createElement(NativeText, { style: styles.filterBadgeLabel, maxFontSizeMultiplier: 1.2 }, filterCount > 9 ? "9+" : String(filterCount)),
        )
        : null}
    </Touch>
  );

  const panel = (
    <LinearGradient
      colors={[palette.header, palette.header, colors.night]}
      locations={[0, 0.35, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={styles.panel}
    >
      <View pointerEvents="none" style={styles.glow} />
      <View style={[styles.column, { width: col }]} onLayout={onColumnLayout}>
        <View style={styles.switchRow}>
          <TopTabs tabs={SIDE_TABS} value={side} onChange={changeSide} appearance="panel" />
        </View>
        <View accessible accessibilityLabel={balanceA11y}>
          {createElement(NativeText, { numberOfLines: 1, style: styles.balanceLabel }, balanceText)}
          <View style={styles.headlineWrap}>{headline}</View>
        </View>
        <View style={styles.currencyWrap}>{currencyRow}</View>
        <View style={styles.divider} />
        <View style={styles.periodRow}>
          <TopTabs tabs={PERIOD_TABS} value={period} onChange={setPeriod} appearance="underline" style={styles.periodTabs} />
          {filterButton}
        </View>
        <View style={styles.caption}>
          {createElement(NativeText, { numberOfLines: 1, style: styles.captionLeft }, `${verb} · ${phrase}`)}
          {createElement(
            NativeText,
            { numberOfLines: 1, style: styles.captionRight },
            unavailable ? "–" : formatMoney(series.totalMinor, currency),
          )}
        </View>
        <View style={styles.chart}>
          <AreaChart
            width={chartWidth}
            values={series.values}
            side={side}
            activeIndex={chartReady ? activeIndex : null}
            tooltip={tooltip}
            state={chartState}
            overlay={overlay}
            animationKey={`${queryKey}|${planState}`}
            onSelect={onSelectBucket}
            accessibilityLabel={`${incoming ? "Owed to you" : "You owe"}, ${phrase}`}
            accessibilityValue={activeBucket ? `${activeBucket.a11yLabel}, ${formatMoney(activeValue, currency)}` : formatMoney(series.totalMinor, currency)}
          />
        </View>
      </View>
    </LinearGradient>
  );

  // ---------------------------------------------------------------------------
  // Axis labels (on the canvas, under the panel, same column)
  // ---------------------------------------------------------------------------
  const selectedAxis = chartReady ? activeIndex : null;
  const axis = chartWidth > 0 && count > 0
    ? createElement(
      View,
      { style: [styles.axis, { width: chartWidth }], importantForAccessibility: "no-hide-descendants", accessibilityElementsHidden: true },
      buckets.map((bucket, index) => {
        const selected = index === selectedAxis;
        const x = chartX(chartWidth, count, index, CHART.PAD_X);
        if (!selected) {
          const thinned = count <= 7 || bucket.label.length === 1 || (count - 1 - index) % Math.ceil(count / 6) === 0;
          if (!thinned) return null;
          if (selectedAxis !== null && Math.abs(x - chartX(chartWidth, count, selectedAxis, CHART.PAD_X)) < AXIS.clearance) return null;
        }
        const width = selected ? AXIS.selectedWidth : AXIS.labelWidth;
        const left = Math.min(Math.max(x - width / 2, 0), Math.max(0, chartWidth - width));
        return createElement(
          NativeText,
          {
            key: bucket.start,
            numberOfLines: 1,
            importantForAccessibility: "no",
            maxFontSizeMultiplier: 1.2,
            style: [styles.axisLabel, selected ? styles.axisLabelSelected : null, { left, width }],
          },
          selected ? bucket.selectedLabel : bucket.label,
        );
      }),
    )
    : createElement(View, { style: { height: AXIS.height } });

  // ---------------------------------------------------------------------------
  // Categories
  // ---------------------------------------------------------------------------
  const categoriesDetail = loading
    ? "By source · loading"
    : offline
      ? "Sources show up once LenaDena reconnects."
      : noTransactions
        ? "By source · nothing recorded yet"
        : `By source · ${phrase} · ${currency}`;

  const categoriesTrailing = unavailable
    ? undefined
    : scope === "all"
      ? (
        <Touch
          onPress={() => setSheetVisible(true)}
          haptic
          pressedScale={0.92}
          accessibilityRole="button"
          accessibilityLabel="Filter by source"
          pressableStyle={[styles.squareButton, { backgroundColor: palette.surface }]}
        >
          <Icon name="chevron-right" size={18} color={colors.violet} />
        </Touch>
      )
      : (
        <Touch
          onPress={() => setScope("all")}
          haptic
          pressedScale={0.92}
          accessibilityRole="button"
          accessibilityLabel="Clear source filter"
          pressableStyle={[styles.squareButton, { backgroundColor: palette.surface }]}
        >
          <Icon name="close" size={18} color={colors.violet} />
        </Touch>
      );

  const highlightKey = scope === "all" ? categories[0]?.key : scope;
  const valueVerb = kind === "payment" ? "paid" : "added";
  const categoryCards = loading
    ? [0, 1].map((index) => (
      <CategoryCard key={`loading-${index}`} variant="outline" icon="grid" title="Loading…" value="–" accessibilityLabel="Loading categories" />
    ))
    : offline
      ? []
      : categories.map((category) => {
        const highlighted = category.key === highlightKey;
        const personal = category.key === "personal";
        const meta = category.count === 0 ? "No entries" : plural(category.count, "entry", "entries");
        const positive = category.valueMinor > 0;
        return (
          <CategoryCard
            key={category.key}
            variant={highlighted ? "highlighted" : "outline"}
            icon={personal ? "user" : "users"}
            leading={!highlighted && !personal ? <GroupAvatar name={category.name} accent={category.accent ?? ""} size="sm" /> : undefined}
            meta={meta}
            title={category.name}
            value={positive ? formatSignedMoney(category.valueMinor, currency, incoming ? "+" : "-") : formatMoney(0, currency)}
            valueTone={positive ? (incoming ? "positive" : "negative") : "ink"}
            onPress={() => toggleScope(category.key)}
            selected={scope === category.key}
            accessibilityLabel={`${category.name}, ${formatMoney(category.valueMinor, currency)} ${valueVerb} ${windowIn(period)}, ${meta}`}
          />
        );
      });
  if (!unavailable && plan.groups.length === 0) {
    categoryCards.push(
      <CategoryCard
        key="new-group"
        variant="dashed"
        title="New group"
        detail="Split shared costs"
        onPress={() => router.push("/group/new")}
        accessibilityLabel="New group. Split shared costs with friends."
      />,
    );
  }

  // ---------------------------------------------------------------------------
  // History
  // ---------------------------------------------------------------------------
  const historyDetail = loading
    ? "Loading your history"
    : offline
      ? "Unavailable while offline"
      : noTransactions
        ? "Nothing recorded yet"
        : `${plural(listItems.length, "entry", "entries")} · ${phrase}${listSides === "side" ? " · one side" : ""}${currencies.length >= 2 ? " · all currencies" : ""}`;

  let history;
  if (loading) {
    history = (
      <LedgerList>
        <View style={styles.spinnerBlock}><Spinner /></View>
      </LedgerList>
    );
  } else if (offline) {
    history = (
      <EmptyState
        icon="alert-circle"
        title="History unavailable"
        detail="Your history will appear once LenaDena reconnects."
        action={{ label: "Try again", onPress: () => void refresh() }}
      />
    );
  } else if (noTransactions) {
    history = (
      <EmptyState
        icon="pulse"
        illustration="activity"
        title="No balance history yet"
        detail="Add an individual or group entry and it shows up here, grouped by day."
        action={{ label: "Add entry", icon: "plus", onPress: onAddEntry }}
      />
    );
  } else if (listItems.length === 0 && filterCount > 0) {
    history = (
      <EmptyState
        icon="filter"
        title="No matching activity"
        detail={groupScope && status !== "all" ? "Group history has no open or settled status. Set Status to All." : "Try clearing one or more filters."}
        action={{ label: "Clear filters", onPress: clearFilters }}
        {...(period !== "all" && olderCount > 0 ? { secondaryAction: { label: "Show all time", icon: "calendar" as const, onPress: () => setPeriod("all") } } : {})}
      />
    );
  } else if (listItems.length === 0) {
    history = (
      <LedgerList>
        <EmptyState
          variant="inset"
          icon="calendar"
          title={`Nothing in the ${phrase}`}
          detail="Older entries are still in your history."
          action={{ label: "Show all time", icon: "calendar", onPress: () => setPeriod("all") }}
        />
      </LedgerList>
    );
  } else {
    history = (
      <View style={styles.days}>
        {days.map((day) => (
          <View key={day.date}>
            <View style={styles.dayHeader}>
              {createElement(NativeText, { accessibilityRole: "header", numberOfLines: 1, style: styles.dayLabel }, relativeDayLabel(day.date, today))}
              {createElement(NativeText, { numberOfLines: 1, style: styles.dayCount }, plural(day.items.length, "entry", "entries"))}
            </View>
            <LedgerList>
              {day.items.map((item, index) => {
                const copy = describeTransaction(item, { context: "activity", today });
                return (
                  <LedgerRow
                    key={`${item.source}-${item.id}`}
                    leading={<EntryTile icon={copy.tile.icon} tone={copy.tile.tone} badge={copy.tile.badge} ringColor={palette.surface} />}
                    title={copy.title}
                    subtitle={copy.subtitle}
                    amount={copy.amount}
                    status={copy.status}
                    divider={index > 0}
                    accessibilityLabel={copy.accessibilityLabel}
                    footer={copy.canSettle ? (
                      <Button
                        label="Mark settled"
                        icon="check"
                        size="md"
                        variant="secondary"
                        loading={settlingId === item.id}
                        onPress={() => confirmSettlement(item)}
                        accessibilityHint={`Marks ${copy.title} as settled after you confirm`}
                      />
                    ) : undefined}
                  />
                );
              })}
            </LedgerList>
          </View>
        ))}
        {period !== "all" && olderCount > 0 ? (
          <View style={styles.olderFooter}>
            {createElement(NativeText, { style: styles.olderLabel }, plural(olderCount, "older entry", "older entries"))}
            <Button label="Show all time" icon="calendar" variant="ghost" size="sm" onPress={() => setPeriod("all")} />
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View>
      {panel}
      <View style={[styles.column, { width: col }]}>
        {axis}
        <View style={styles.section}>
          <SectionHeader title="Categories" detail={categoriesDetail} trailing={categoriesTrailing} style={styles.sectionHeader} />
          {categoryCards.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              snapToInterval={CATEGORY_SNAP}
              style={styles.cardScroller}
              contentContainerStyle={styles.cardRow}
            >
              {categoryCards}
            </ScrollView>
          ) : null}
        </View>
        <View style={[styles.section, styles.historySection]}>
          <SectionHeader title="History" detail={historyDetail} style={styles.historyHeader} />
          {history}
        </View>
      </View>

      <ActivityFilterSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        period={period}
        onPeriodChange={setPeriod}
        scope={scope}
        onScopeChange={setScope}
        kind={kind}
        onKindChange={setKind}
        status={status}
        onStatusChange={setStatus}
        balance={listSides === "both" ? "both" : side}
        onBalanceChange={changeBalance}
        groups={plan.groups}
        activeCount={filterCount}
        resultCount={listItems.length}
        onClear={clearFilters}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    overflow: "hidden",
  },
  glow: {
    position: "absolute",
    right: -60,
    top: 40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(181,165,255,0.14)",
  },
  column: {
    alignSelf: "center",
  },
  switchRow: {
    paddingTop: 8,
    marginHorizontal: 20,
  },
  balanceLabel: {
    marginTop: 18,
    paddingHorizontal: 20,
    textAlign: "center",
    fontFamily: "Manrope_600SemiBold",
    fontSize: 14,
    lineHeight: 20,
    color: "rgba(244,240,255,0.66)",
  },
  headlineWrap: {
    minHeight: 46,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headline: {
    textAlign: "center",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 38,
    lineHeight: 46,
    letterSpacing: -1,
    color: colors.white,
  },
  headlineBar: {
    width: 140,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  currencyWrap: {
    marginTop: 4,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  currencyLine: {
    textAlign: "center",
    fontFamily: "Manrope_600SemiBold",
    fontSize: 12,
    lineHeight: 16,
    color: "rgba(255,255,255,0.55)",
  },
  pills: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 2,
  },
  pill: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pillSelected: {
    backgroundColor: "rgba(255,255,255,0.16)",
    borderColor: "rgba(255,255,255,0.22)",
  },
  pillIdle: {
    borderColor: "rgba(255,255,255,0.12)",
  },
  pillLabel: {
    fontFamily: "Manrope_700Bold",
    fontSize: 12,
    lineHeight: 16,
  },
  divider: {
    marginTop: 16,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  periodRow: {
    marginTop: 8,
    paddingHorizontal: 12,
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  periodTabs: {
    flex: 1,
  },
  filterButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.raised,
  },
  filterBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.coral,
  },
  filterBadgeLabel: {
    fontFamily: "Manrope_700Bold",
    fontSize: 10,
    lineHeight: 12,
    color: colors.white,
  },
  caption: {
    marginTop: 4,
    paddingHorizontal: 20,
    height: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  captionLeft: {
    flexShrink: 1,
    fontFamily: "Manrope_600SemiBold",
    fontSize: 12,
    lineHeight: 16,
    color: "rgba(255,255,255,0.6)",
  },
  captionRight: {
    fontFamily: "Manrope_700Bold",
    fontSize: 13,
    lineHeight: 18,
    color: colors.white,
  },
  chart: {
    marginTop: 4,
    height: CHART.H,
  },
  axis: {
    height: AXIS.height,
  },
  axisLabel: {
    position: "absolute",
    top: 8,
    textAlign: "center",
    fontFamily: "Manrope_500Medium",
    fontSize: 12,
    lineHeight: 16,
    color: colors.slate,
  },
  axisLabelSelected: {
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 13,
    lineHeight: 16,
    color: colors.ink,
  },
  section: {
    marginTop: layout.sectionGap,
  },
  sectionHeader: {
    paddingHorizontal: 20,
    marginBottom: 0,
  },
  squareButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  cardScroller: {
    marginTop: 14,
  },
  cardRow: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
  },
  historySection: {
    paddingHorizontal: 20,
  },
  historyHeader: {
    marginBottom: 14,
  },
  spinnerBlock: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  days: {
    gap: 18,
  },
  dayHeader: {
    marginBottom: 8,
    paddingHorizontal: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  dayLabel: {
    flexShrink: 1,
    fontFamily: "Manrope_700Bold",
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink,
  },
  dayCount: {
    fontFamily: "Manrope_600SemiBold",
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: colors.slate,
  },
  olderFooter: {
    marginTop: 4,
    alignItems: "center",
    gap: 4,
  },
  olderLabel: {
    fontFamily: "Manrope_500Medium",
    fontSize: 12,
    lineHeight: 16,
    color: colors.slate,
  },
});
