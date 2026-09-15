import { createElement } from "react";
import { StyleSheet, Text as NativeText, View } from "react-native";
import { router } from "expo-router";
import { Sparkline } from "@/components/charts/Sparkline";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { DashedOutline } from "@/components/ui/DashedOutline";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Touch } from "@/components/ui/Touch";
import { groupSkin } from "@/features/groups/groupSkin";
import type { BalanceMover } from "@/features/ledger/balanceSeries";
import type { PlanState } from "@/features/ledger/planState";
import type { TabKey } from "@/features/ledger/types";
import { usePreferences } from "@/features/preferences/PreferencesProvider";
import { formatMoney, formatSignedMoney } from "@/lib/format";
import { shadows } from "@/theme/shadows";
import { colors } from "@/theme/tokens";

export type BalanceMoversProps = {
  movers: readonly BalanceMover[];
  planState: PlanState;
  hasGroups: boolean;
  /** Width of the centred content column (min(window, 560)). */
  column: number;
  onChangeTab: (tab: TabKey) => void;
};

const CARD_HEIGHT = 112;
const WINDOW_DAYS = 30;
const FLAT_SERIES: readonly number[] = [0, 0];

type Placeholder = {
  key: string;
  icon: IconName;
  title: string;
  detail: string;
  onPress?: () => void;
  accessibilityLabel: string;
};

const NO_GROUPS: Placeholder = {
  key: "no-groups",
  icon: "users",
  title: "No groups yet",
  detail: "Create one to split costs",
  onPress: () => router.push("/group/new"),
  accessibilityLabel: "No groups yet. Create one to split costs.",
};

const TRACK_FRIEND: Placeholder = {
  key: "track-friend",
  icon: "user",
  title: "Track a friend",
  detail: "Log what you lend or borrow",
  onPress: () => router.push("/transaction/new"),
  accessibilityLabel: "Track a friend. Log what you lend or borrow.",
};

function statusPlaceholders(planState: PlanState): Placeholder[] {
  const offline = planState === "offline";
  const base = {
    icon: (offline ? "alert-circle" : "clock") as IconName,
    title: offline ? "Offline" : "Loading…",
    detail: offline ? "Balances show up once you're back online" : "Fetching your balances",
  };
  return [0, 1].map((slot) => ({ ...base, key: `${planState}-${slot}`, accessibilityLabel: `${base.title} ${base.detail}.` }));
}

/** "Top movers": the most active group and personal balances, each with a 30-day sparkline. */
export function BalanceMovers({ movers, planState, hasGroups, column, onChangeTab }: BalanceMoversProps) {
  const cardWidth = Math.max(0, Math.floor((column - 40 - 12) / 2));
  const waiting = planState === "loading" || planState === "offline";
  const shown = waiting ? [] : movers;

  let placeholders: Placeholder[] = [];
  if (waiting) placeholders = statusPlaceholders(planState);
  else if (shown.length === 0) placeholders = [NO_GROUPS, TRACK_FRIEND];
  else if (shown.length % 2 === 1) placeholders = [hasGroups ? TRACK_FRIEND : NO_GROUPS];

  const detail = !waiting && shown.length === 0 ? "Groups and people you track will show up here" : `Most active balances in the last ${WINDOW_DAYS} days`;

  return (
    <View>
      <SectionHeader title="Top movers" detail={detail} style={styles.header} />
      <View style={styles.grid}>
        {shown.map((mover) => (
          <MoverCard key={mover.key} mover={mover} width={cardWidth} onChangeTab={onChangeTab} />
        ))}
        {placeholders.map((placeholder) => (
          <PlaceholderCard key={placeholder.key} placeholder={placeholder} width={cardWidth} />
        ))}
      </View>
    </View>
  );
}

function MoverCard({ mover, width, onChangeTab }: { mover: BalanceMover; width: number; onChangeTab: (tab: TabKey) => void }) {
  const { palette } = usePreferences();
  const change = mover.changeMinor;
  const tone = change > 0 ? "positive" : change < 0 ? "negative" : "neutral";
  const changeText = change > 0
    ? formatSignedMoney(change, mover.currency, "+")
    : change < 0
      ? formatSignedMoney(change, mover.currency, "-")
      : "No change";
  const changeColor = change > 0 ? colors.mint : change < 0 ? colors.coral : colors.ink;
  const balance = formatMoney(Math.abs(mover.balanceMinor), mover.currency);
  const state = mover.balanceMinor > 0 ? `owed ${balance}` : mover.balanceMinor < 0 ? `you owe ${balance}` : "all square";
  const stateLabel = mover.balanceMinor > 0 ? `owed to you ${balance}` : mover.balanceMinor < 0 ? `you owe ${balance}` : "all square";
  const trend = change > 0
    ? `up ${formatMoney(change, mover.currency)} in ${WINDOW_DAYS} days`
    : change < 0
      ? `down ${formatMoney(Math.abs(change), mover.currency)} in ${WINDOW_DAYS} days`
      : `no change in ${WINDOW_DAYS} days`;
  const skin = mover.kind === "group" ? groupSkin(mover.accent) : null;
  const groupId = mover.kind === "group" ? mover.id : undefined;

  const onPress = () => {
    if (groupId) router.push({ pathname: "/group/[id]", params: { id: groupId } });
    else onChangeTab("activity");
  };

  return (
    <Touch
      onPress={onPress}
      pressedScale={0.96}
      accessibilityRole="button"
      accessibilityLabel={`${mover.name}, ${stateLabel}, ${trend}`}
      accessibilityHint={groupId ? "Opens the group" : "Opens Activity"}
      containerStyle={{ width }}
      pressableStyle={styles.pressable}
    >
      <View style={[styles.card, { backgroundColor: palette.surface }, shadows.card]}>
        <View style={styles.topRow}>
          {createElement(
            NativeText,
            { numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.7, maxFontSizeMultiplier: 1.2, style: [styles.change, { color: changeColor }] },
            changeText,
          )}
          <View style={[styles.tile, { backgroundColor: skin ? skin.tint : colors.violetSoft }]}>
            <Icon name={skin ? "users" : "user"} size={14} color={skin ? skin.icon : colors.violet} />
          </View>
        </View>
        <View style={styles.bottomRow}>
          <View style={styles.nameColumn}>
            {createElement(NativeText, { numberOfLines: 1, maxFontSizeMultiplier: 1.2, style: styles.name }, mover.name)}
            {createElement(NativeText, { numberOfLines: 1, maxFontSizeMultiplier: 1.2, style: styles.state }, state)}
          </View>
          <Sparkline values={mover.series} tone={tone} ringColor={palette.surface} />
        </View>
      </View>
    </Touch>
  );
}

function PlaceholderCard({ placeholder, width }: { placeholder: Placeholder; width: number }) {
  const { palette } = usePreferences();
  const content = (
    // Same frame as a mover card, with the solid border swapped for an SVG dashed outline (D16) and no shadow.
    <View style={[styles.card, styles.placeholderCard, { backgroundColor: palette.surface }]}>
      <DashedOutline width={width} height={CARD_HEIGHT} radius={20} color={colors.line} />
      <View style={styles.topRow}>
        {createElement(NativeText, { numberOfLines: 1, maxFontSizeMultiplier: 1.2, style: styles.placeholderTitle }, placeholder.title)}
        <View style={[styles.tile, { backgroundColor: colors.violetSoft }]}>
          <Icon name={placeholder.icon} size={14} color={colors.violet} />
        </View>
      </View>
      <View style={styles.bottomRow}>
        <View style={styles.nameColumn}>
          {createElement(NativeText, { numberOfLines: 2, maxFontSizeMultiplier: 1.2, style: styles.placeholderDetail }, placeholder.detail)}
        </View>
        <Sparkline values={FLAT_SERIES} tone="neutral" ringColor={palette.surface} />
      </View>
    </View>
  );

  if (!placeholder.onPress) {
    return (
      <View accessible accessibilityLabel={placeholder.accessibilityLabel} style={{ width }}>
        {content}
      </View>
    );
  }

  return (
    <Touch
      onPress={placeholder.onPress}
      pressedScale={0.96}
      accessibilityRole="button"
      accessibilityLabel={placeholder.accessibilityLabel}
      containerStyle={{ width }}
      pressableStyle={styles.pressable}
    >
      {content}
    </Touch>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    marginTop: 28,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingHorizontal: 20,
  },
  pressable: {
    height: CARD_HEIGHT,
  },
  card: {
    height: CARD_HEIGHT,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
  },
  placeholderCard: {
    borderWidth: 0,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  change: {
    flex: 1,
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 18,
    lineHeight: 24,
  },
  tile: {
    width: 26,
    height: 26,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  bottomRow: {
    marginTop: "auto",
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  nameColumn: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontFamily: "Manrope_700Bold",
    fontSize: 12,
    lineHeight: 16,
    color: colors.ink,
  },
  state: {
    fontFamily: "Manrope_500Medium",
    fontSize: 11,
    lineHeight: 14,
    color: colors.slate,
  },
  placeholderTitle: {
    flex: 1,
    fontFamily: "Manrope_700Bold",
    fontSize: 14,
    lineHeight: 18,
    color: colors.ink,
  },
  placeholderDetail: {
    fontFamily: "Manrope_500Medium",
    fontSize: 11,
    lineHeight: 14,
    color: colors.slate,
  },
});
