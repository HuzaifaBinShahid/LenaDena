import { createElement, useEffect, type ReactNode } from "react";
import { Text as NativeText, useWindowDimensions, View } from "react-native";
import { router } from "expo-router";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { CategoryCard } from "@/components/ui/CategoryCard";
import { CornerBadge, EntryTile } from "@/components/ui/EntryTile";
import { LedgerList, LedgerRow } from "@/components/ui/LedgerRow";
import { Spinner } from "@/components/ui/Spinner";
import type { HomeTabProps } from "@/features/home/tab-props";
import { useLedger } from "@/features/ledger/LedgerProvider";
import { getPlanState } from "@/features/ledger/planState";
import type { CornerBadgeKind } from "@/features/ledger/rowCopy";
import type { Member, Settlement } from "@/features/ledger/types";
import { formatDateTime, formatMoney, formatShortDate } from "@/lib/format";
import { layout } from "@/theme/layout";
import { makeStyles, useTheme } from "@/theme/ThemeProvider";

function openPayment(item: Settlement) {
  router.push({ pathname: "/settlement/[id]", params: { id: item.id } });
}

function paymentSubtitle(item: Settlement) {
  return `${item.eventName ?? "Payment"} · ${item.eventDate ? formatShortDate(item.eventDate) : "Today"}`;
}

/** The existing three-way fallback line for a sent claim, unchanged. */
function claimNote(claim: Settlement) {
  return !claim.recipientHasOpenedApp
    ? `${claim.recipient.name} has not opened LenaDena · fallback is ready`
    : claim.canSelfSettle
      ? "Review window ended · you can close this yourself"
      : `Fallback available ${claim.selfSettleAvailableAt ? formatDateTime(claim.selfSettleAvailableAt) : "after the review window"}`;
}

/** Largest per-currency sum, plus " +1 currency" when reviews span more currencies. */
function reviewSumLabel(reviews: Settlement[]) {
  const sums = new Map<string, number>();
  for (const review of reviews) sums.set(review.currency, (sums.get(review.currency) ?? 0) + review.amountMinor);
  let top: [string, number] | null = null;
  for (const entry of sums) if (!top || entry[1] > top[1]) top = entry;
  if (!top) return undefined;
  const more = sums.size - 1;
  return `${formatMoney(top[1], top[0])}${more > 0 ? ` +${more} ${more === 1 ? "currency" : "currencies"}` : ""}`;
}

function PersonLeading({ person, badge, ringColor }: { person: Member; badge: CornerBadgeKind; ringColor: string }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Avatar name={person.name} uri={person.avatarUrl} size="md" />
      <CornerBadge kind={badge} ringColor={ringColor} />
    </View>
  );
}

function SpinnerRow() {
  const styles = useStyles();
  return (
    <View style={styles.spinnerRow} accessible accessibilityLabel="Loading payments">
      <Spinner />
    </View>
  );
}

export function ReviewsView(_props: HomeTabProps) {
  const { plan, connection, refresh } = useLedger();
  const { colors: c } = useTheme();
  const styles = useStyles();
  const { width: windowWidth } = useWindowDimensions();
  const col = Math.min(windowWidth, layout.contentMax);
  const planState = getPlanState(plan, connection);
  const loading = planState === "loading";
  const offline = planState === "offline";
  const unavailable = loading || offline;

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const nextUnlock = plan.claims
      .filter((claim) => !claim.canSelfSettle && claim.selfSettleAvailableAt)
      .map((claim) => Date.parse(claim.selfSettleAvailableAt as string))
      .filter(Number.isFinite)
      .sort((left, right) => left - right)[0];
    if (!nextUnlock) return;
    const timer = setTimeout(() => void refresh(), Math.min(Math.max(nextUnlock - Date.now() + 250, 1000), 2147483647));
    return () => clearTimeout(timer);
  }, [plan.claims, refresh]);

  const reviewCount = plan.reviews.length;
  const claimCount = plan.claims.length;
  const canSettleCount = plan.claims.filter((claim) => claim.canSelfSettle).length;
  const reviewSum = reviewSumLabel(plan.reviews);

  // ---------------------------------------------------------------------------
  // Summary pair
  // ---------------------------------------------------------------------------
  const toReviewCard = unavailable ? (
    <CategoryCard
      layout="summary"
      variant="outline"
      icon="clock"
      title="To review"
      value="–"
      accessibilityLabel={loading ? "To review, loading" : "To review, unavailable offline"}
    />
  ) : reviewCount > 0 ? (
    <CategoryCard
      layout="summary"
      variant="highlighted"
      icon="clock"
      title="To review"
      value={String(reviewCount)}
      {...(reviewSum ? { meta: reviewSum } : {})}
      accessibilityLabel={`To review, ${reviewCount} ${reviewCount === 1 ? "payment" : "payments"}${reviewSum ? `, ${reviewSum}` : ""}`}
    />
  ) : (
    <CategoryCard
      layout="summary"
      variant="outline"
      icon="check-circle"
      title="To review"
      value="0"
      meta="All clear"
      accessibilityLabel="To review, 0 payments, all clear"
    />
  );

  const sentDetail = canSettleCount > 0
    ? `${canSettleCount} can settle now`
    : claimCount > 0
      ? "Waiting for review"
      : "Nothing pending";
  const sentCard = (
    <CategoryCard
      layout="summary"
      variant="outline"
      icon="send"
      title="Sent"
      value={unavailable ? "–" : String(claimCount)}
      {...(unavailable ? {} : { detail: sentDetail, detailDot: canSettleCount > 0 ? ("positive" as const) : ("neutral" as const) })}
      accessibilityLabel={unavailable
        ? `Sent, ${loading ? "loading" : "unavailable offline"}`
        : `Sent, ${claimCount} ${claimCount === 1 ? "payment" : "payments"}, ${sentDetail}`}
    />
  );

  // ---------------------------------------------------------------------------
  // Needs your review
  // ---------------------------------------------------------------------------
  let reviewRows: ReactNode;
  if (loading) {
    reviewRows = <SpinnerRow />;
  } else if (offline) {
    reviewRows = (
      <LedgerRow
        leading={<EntryTile icon="alert-circle" tone="neutral" ringColor={c.raised} />}
        title="Payments unavailable"
        subtitle="Can't reach LenaDena"
        note="Reviews and sent payments appear once LenaDena reconnects."
        accessibilityLabel="Payments unavailable. Reviews and sent payments appear once LenaDena reconnects."
        footer={<Button label="Try again" size="md" variant="secondary" onPress={() => void refresh()} />}
      />
    );
  } else if (reviewCount === 0) {
    reviewRows = (
      <LedgerRow
        leading={<EntryTile icon="check-circle" tone="violet" ringColor={c.raised} />}
        title="Nothing to review"
        subtitle="You're all caught up"
        note="When a friend says they paid you, it appears here."
        accessibilityLabel="Nothing to review. When a friend says they paid you, it appears here."
      />
    );
  } else {
    reviewRows = plan.reviews.map((review, index) => {
      const amount = formatMoney(review.amountMinor, review.currency);
      return (
        <LedgerRow
          key={review.id}
          onPress={() => openPayment(review)}
          chevron
          divider={index > 0}
          leading={<PersonLeading person={review.debtor} badge="clock" ringColor={c.raised} />}
          title={`${review.debtor.name} says they paid`}
          subtitle={paymentSubtitle(review)}
          amount={{ text: amount, tone: "neutral" }}
          status={{ label: "Needs review", tone: "warning" }}
          accessibilityLabel={`${review.debtor.name} says they paid ${amount}${review.eventName ? ` for ${review.eventName}` : ""}. Needs your review.`}
          accessibilityHint="Opens the payment to confirm or flag it"
        />
      );
    });
  }

  // ---------------------------------------------------------------------------
  // Sent for review
  // ---------------------------------------------------------------------------
  let claimRows: ReactNode;
  if (loading) {
    claimRows = <SpinnerRow />;
  } else if (offline) {
    claimRows = (
      <LedgerRow
        leading={<EntryTile icon="send" tone="neutral" ringColor={c.raised} />}
        title="Sent payments unavailable"
        subtitle="Waiting for a connection"
        accessibilityLabel="Sent payments unavailable while offline."
      />
    );
  } else if (claimCount === 0) {
    const hasGroups = plan.groups.length > 0;
    const explanation = hasGroups ? "Tap I paid after you pay someone back." : "Payments settle group balances. Create a group to start.";
    claimRows = (
      <LedgerRow
        leading={<EntryTile icon="send" tone="violet" ringColor={c.raised} />}
        title="No payments sent"
        subtitle={hasGroups ? "Nothing waiting for confirmation" : "No groups yet"}
        note={explanation}
        accessibilityLabel={`No payments sent. ${explanation}`}
        footer={hasGroups
          ? <Button label="I paid" icon="send" size="md" variant="secondary" onPress={() => router.push("/settlement/new")} />
          : <Button label="New group" icon="users" size="md" variant="secondary" onPress={() => router.push("/group/new")} />}
      />
    );
  } else {
    claimRows = plan.claims.map((claim, index) => {
      const amount = formatMoney(claim.amountMinor, claim.currency);
      const note = claimNote(claim);
      const statusLabel = claim.canSelfSettle ? "Can settle" : "Waiting";
      return (
        <LedgerRow
          key={claim.id}
          onPress={() => openPayment(claim)}
          chevron
          divider={index > 0}
          leading={<PersonLeading person={claim.recipient} badge={claim.canSelfSettle ? "check" : "send"} ringColor={c.raised} />}
          title={`Sent to ${claim.recipient.name}`}
          subtitle={paymentSubtitle(claim)}
          note={note}
          amount={{ text: amount, tone: "neutral" }}
          status={{ label: statusLabel, tone: claim.canSelfSettle ? "positive" : "neutral" }}
          accessibilityLabel={`Sent ${amount} to ${claim.recipient.name}${claim.eventName ? ` for ${claim.eventName}` : ""}. ${note}. ${statusLabel}.`}
          accessibilityHint="Opens the payment"
        />
      );
    });
  }

  return (
    <View style={[styles.root, { width: col }]}>
      {createElement(NativeText, { style: styles.intro }, "Review money received and track payments you sent.")}

      <View style={styles.summary}>
        {toReviewCard}
        {sentCard}
      </View>

      <View>
        <SectionHeader title="Needs your review" detail="Confirm only after the money reaches you." style={styles.sectionHeader} />
        <LedgerList>{reviewRows}</LedgerList>
      </View>

      <View>
        <SectionHeader title="Sent for review" detail="Track each claim until it is confirmed or settled." style={styles.sectionHeader} />
        <LedgerList>{claimRows}</LedgerList>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: {
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 24,
    gap: layout.sectionGap,
  },
  intro: {
    fontFamily: "Manrope_500Medium",
    fontSize: 13,
    lineHeight: 19,
    color: c.slate,
  },
  summary: {
    flexDirection: "row",
    gap: 12,
  },
  sectionHeader: {
    marginBottom: 14,
  },
  spinnerRow: {
    minHeight: 76,
    alignItems: "center",
    justifyContent: "center",
  },
}));
