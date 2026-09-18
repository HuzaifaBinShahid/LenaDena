import { createElement, useMemo } from "react";
import { StyleSheet, Text as NativeText, useWindowDimensions, View } from "react-native";
import { router } from "expo-router";
import { EntryTile } from "@/components/ui/EntryTile";
import { LedgerList, LedgerRow } from "@/components/ui/LedgerRow";
import { Touch } from "@/components/ui/Touch";
import { BalancePager, type BalancePage } from "@/features/home/BalanceCard";
import { BalanceMovers } from "@/features/home/BalanceMovers";
import { QuickActions } from "@/features/home/QuickActions";
import type { HomeTabProps } from "@/features/home/tab-props";
import { getBalanceMovers, getNetChange, hasBalanceHistory } from "@/features/ledger/balanceSeries";
import { useLedger } from "@/features/ledger/LedgerProvider";
import { getPlanState, type PlanState } from "@/features/ledger/planState";
import { getOpenBalanceTotals } from "@/features/ledger/selectors";
import type { Plan, Settlement } from "@/features/ledger/types";
import { PeopleStrip } from "@/features/people/PeopleStrip";
import { formatMoney, formatShortDate, todayDate } from "@/lib/format";
import { layout } from "@/theme/layout";
import { makeStyles, useTheme } from "@/theme/ThemeProvider";

/** Currency shown on the single placeholder page (loading, offline, empty); the same fallback ActivityView uses. */
const FALLBACK_CURRENCY = "PKR";
const CHANGE_DAYS = 7;

function buildPages(plan: Plan, planState: PlanState, today: string): BalancePage[] {
  if (planState !== "ready") {
    return [{
      currency: FALLBACK_CURRENCY,
      mode: planState,
      netMinor: 0,
      owedMinor: 0,
      oweMinor: 0,
      change: { changeMinor: 0, eventCount: 0, tracked: false },
    }];
  }
  const totals = getOpenBalanceTotals(plan);
  if (!totals.length) {
    // Ready but with no totals yet (for example only a pending review): an honest all-square page, never a blank card.
    return [{
      currency: plan.groups[0]?.currency ?? FALLBACK_CURRENCY,
      mode: "ready",
      netMinor: 0,
      owedMinor: 0,
      oweMinor: 0,
      change: { changeMinor: 0, eventCount: 0, tracked: false },
    }];
  }
  return totals.map((total) => ({
    currency: total.currency,
    mode: "ready",
    netMinor: total.owedMinor - total.oweMinor,
    owedMinor: total.owedMinor,
    oweMinor: total.oweMinor,
    change: { ...getNetChange(plan, total.currency, { today, days: CHANGE_DAYS }), tracked: hasBalanceHistory(plan, total.currency) },
  }));
}

/** Plan tab: balance pager, the payment waiting for review, quick actions, people and top movers. */
export function PlanView({ onAddEntry, onChangeTab }: HomeTabProps) {
  const { plan, connection } = useLedger();
  const { width } = useWindowDimensions();
  const column = Math.min(width, layout.contentMax);
  const planState = getPlanState(plan, connection);
  const today = todayDate();
  const pages = useMemo(() => buildPages(plan, planState, today), [plan, planState, today]);
  const movers = useMemo(() => (planState === "ready" ? getBalanceMovers(plan, { today, days: 30, limit: 4 }) : []), [plan, planState, today]);
  const waiting = planState === "loading" || planState === "offline";

  return (
    <View style={[styles.column, { width: column }]}>
      <BalancePager pages={pages} onAddEntry={onAddEntry} />
      {plan.reviews.length ? <Attention plan={plan} onChangeTab={onChangeTab} /> : null}
      <QuickActions needsGroup={!waiting && plan.groups.length === 0} />
      <PeopleStrip />
      <BalanceMovers movers={movers} planState={planState} hasGroups={plan.groups.length > 0} column={column} onChangeTab={onChangeTab} />
    </View>
  );
}

function reviewSubtitle(review: Settlement, plan: Plan) {
  const name = review.eventName?.trim() || plan.groups.find((group) => group.id === review.groupId)?.name || "Payment";
  return `${name} · ${review.eventDate ? formatShortDate(review.eventDate) : "Today"}`;
}

function Attention({ plan, onChangeTab }: Pick<HomeTabProps, "onChangeTab"> & { plan: Plan }) {
  const themed = useStyles();
  const { colors: c } = useTheme();
  const review = plan.reviews[0];
  if (!review) return null;
  const amount = formatMoney(review.amountMinor, review.currency);
  const reason = review.eventName?.trim() ? ` for ${review.eventName.trim()}` : "";
  const more = plan.reviews.length - 1;

  return (
    <View style={styles.attention}>
      <LedgerList>
        <LedgerRow
          leading={<EntryTile icon="send" tone="gold" ringColor={c.raised} />}
          title={`${review.debtor.name} paid?`}
          subtitle={reviewSubtitle(review, plan)}
          amount={{ text: amount, tone: "neutral" }}
          status={{ label: "Needs review", tone: "warning" }}
          chevron
          onPress={() => router.push({ pathname: "/settlement/[id]", params: { id: review.id } })}
          accessibilityLabel={`${review.debtor.name} says they paid ${amount}${reason}. Needs your review.`}
          accessibilityHint="Opens the payment review"
        />
      </LedgerList>
      {more > 0 ? (
        <Touch
          onPress={() => onChangeTab("reviews")}
          accessibilityRole="button"
          accessibilityLabel={`${more} more ${more === 1 ? "payment" : "payments"} to review. View all`}
          pressableStyle={styles.moreButton}
        >
          {createElement(NativeText, { numberOfLines: 1, style: [styles.moreLabel, themed.moreLabel] }, `+${more} more · View all`)}
        </Touch>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  column: {
    alignSelf: "center",
  },
  attention: {
    marginHorizontal: 20,
    marginTop: 4,
  },
  moreButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  moreLabel: {
    fontFamily: "Manrope_600SemiBold",
    fontSize: 12,
    lineHeight: 16,
  },
});

const useStyles = makeStyles((c, { isDark }) => ({
  moreLabel: {
    // Violet link in light; lavender in dark, where violet is only 4.1:1 on the canvas.
    color: isDark ? c.lavender : c.violet,
  },
}));
