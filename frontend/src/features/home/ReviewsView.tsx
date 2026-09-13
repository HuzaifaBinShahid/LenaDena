import { View } from "react-native";
import { Text } from "@/components/ui/Text";
import { router } from "expo-router";
import { EmptyState } from "@/components/layout/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { Touch } from "@/components/ui/Touch";
import { useLedger } from "@/features/ledger/LedgerProvider";
import { formatMoney, formatShortDate } from "@/lib/format";
import { colors } from "@/theme/tokens";

export function ReviewsView() {
  const { plan } = useLedger();
  return (
    <View className="gap-5 px-[18px] py-5">
      <View>
        <Text className="text-[26px] font-bold tracking-tight text-ink">Payment reviews</Text>
        <Text className="mt-1 text-[13px] leading-5 text-slate">Confirm only after the money reaches you.</Text>
      </View>
      {plan.reviews.length === 0 ? (
        <EmptyState icon="check-circle" title="You are all caught up" detail="New payment claims will wait here for your confirmation." />
      ) : (
        <View className="gap-3">
          {plan.reviews.map((review) => (
            <Touch
              key={review.id}
              onPress={() => router.push({ pathname: "/settlement/[id]", params: { id: review.id } })}
              className="rounded-card border border-line bg-raised p-4 shadow-sm shadow-black/5"
              accessibilityRole="button"
            >
              <View className="flex-row items-start gap-3">
                <View className="h-12 w-12 items-center justify-center rounded-2xl bg-gold-soft">
                  <Icon name="send" size={21} color={colors.gold} />
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center justify-between gap-2">
                    <Badge label="Awaiting review" tone="warning" />
                    <Icon name="chevron-right" size={18} color={colors.muted} />
                  </View>
                  <Text className="mt-3 text-[17px] font-bold text-ink">{review.debtor.name} says they paid</Text>
                  <Text className="mt-1 text-[28px] font-bold tracking-tight text-ink">{formatMoney(review.amountMinor, review.currency)}</Text>
                  <Text className="mt-2 text-xs text-slate">{review.eventName} · {review.eventDate ? formatShortDate(review.eventDate) : "Today"}</Text>
                </View>
              </View>
            </Touch>
          ))}
        </View>
      )}
    </View>
  );
}
