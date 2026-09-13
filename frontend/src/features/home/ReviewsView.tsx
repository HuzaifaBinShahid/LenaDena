import { useEffect } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { EmptyState } from "@/components/layout/EmptyState";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { Text } from "@/components/ui/Text";
import { Touch } from "@/components/ui/Touch";
import { useLedger } from "@/features/ledger/LedgerProvider";
import type { Settlement } from "@/features/ledger/types";
import { formatDateTime, formatMoney, formatShortDate } from "@/lib/format";
import { colors } from "@/theme/tokens";

function openPayment(item: Settlement) {
  router.push({ pathname: "/settlement/[id]", params: { id: item.id } });
}

export function ReviewsView() {
  const { plan, refresh } = useLedger();
  const empty = plan.reviews.length === 0 && plan.claims.length === 0;

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

  return (
    <View className="gap-6 px-[18px] py-5">
      <View>
        <Text className="text-[26px] font-bold tracking-tight text-ink">Payments</Text>
        <Text className="mt-1 text-[13px] leading-5 text-slate">Review money received and track payments you sent.</Text>
      </View>

      {empty ? <EmptyState icon="check-circle" title="No payments waiting" detail="Payments sent for confirmation will stay visible here until they are settled." /> : null}

      {plan.reviews.length > 0 ? (
        <View>
          <SectionHeader title="Needs your review" detail="Confirm only after the money reaches you." />
          <View className="gap-3">
            {plan.reviews.map((review) => (
              <Touch
                key={review.id}
                onPress={() => openPayment(review)}
                className="rounded-card border border-line bg-raised p-4 shadow-sm shadow-black/5"
                accessibilityRole="button"
              >
                <View className="flex-row items-start gap-3">
                  <Avatar name={review.debtor.name} uri={review.debtor.avatarUrl} />
                  <View className="min-w-0 flex-1">
                    <View className="flex-row items-center justify-between gap-2">
                      <Badge label="Awaiting your review" tone="warning" />
                      <Icon name="chevron-right" size={18} color={colors.muted} />
                    </View>
                    <Text className="mt-3 text-[17px] font-bold text-ink">{review.debtor.name} says they paid</Text>
                    <Text className="mt-1 text-[26px] font-bold tracking-tight text-ink">{formatMoney(review.amountMinor, review.currency)}</Text>
                    <Text className="mt-2 text-xs text-slate">{review.eventName ?? "Payment"} · {review.eventDate ? formatShortDate(review.eventDate) : "Today"}</Text>
                  </View>
                </View>
              </Touch>
            ))}
          </View>
        </View>
      ) : null}

      {plan.claims.length > 0 ? (
        <View>
          <SectionHeader title="Sent for review" detail="Track each claim until it is confirmed or settled." />
          <View className="gap-3">
            {plan.claims.map((claim) => (
              <Touch
                key={claim.id}
                onPress={() => openPayment(claim)}
                className="rounded-card border border-line bg-raised p-4 shadow-sm shadow-black/5"
                accessibilityRole="button"
              >
                <View className="flex-row items-start gap-3">
                  <Avatar name={claim.recipient.name} uri={claim.recipient.avatarUrl} />
                  <View className="min-w-0 flex-1">
                    <View className="flex-row items-center justify-between gap-2">
                      <Badge label={claim.canSelfSettle ? "Can settle now" : "Waiting for review"} tone={claim.canSelfSettle ? "positive" : "neutral"} />
                      <Icon name="chevron-right" size={18} color={colors.muted} />
                    </View>
                    <Text className="mt-3 text-[17px] font-bold text-ink">Sent to {claim.recipient.name}</Text>
                    <Text className="mt-1 text-[26px] font-bold tracking-tight text-ink">{formatMoney(claim.amountMinor, claim.currency)}</Text>
                    <Text className="mt-2 text-xs leading-5 text-slate">
                      {!claim.recipientHasOpenedApp
                        ? `${claim.recipient.name} has not opened LenaDena · fallback is ready`
                        : claim.canSelfSettle
                          ? "Review window ended · you can close this yourself"
                          : `Fallback available ${claim.selfSettleAvailableAt ? formatDateTime(claim.selfSettleAvailableAt) : "after the review window"}`}
                    </Text>
                  </View>
                </View>
              </Touch>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}
