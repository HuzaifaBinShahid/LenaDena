import { useState } from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/Text";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { GroupAvatar } from "@/components/ui/GroupAvatar";
import { Icon } from "@/components/ui/Icon";
import { Touch } from "@/components/ui/Touch";
import { useLedger } from "@/features/ledger/LedgerProvider";
import { formatMoney, formatShortDate } from "@/lib/format";
import { colors } from "@/theme/tokens";
import { ExpenseScopeModal } from "@/components/expense/ExpenseScopeModal";
import { getOpenBalanceTotals } from "@/features/ledger/selectors";

export function PlanView() {
  const { plan } = useLedger();
  const [scopeVisible, setScopeVisible] = useState(false);
  const totals = getOpenBalanceTotals(plan);
  return (
    <View className="gap-8 px-5 py-6">
      <View className="gap-3">
        {totals.map((total) => {
          const netMinor = total.owedMinor - total.oweMinor;
          return (
            <LinearGradient
              key={total.currency}
              colors={[colors.plum, "#342065", "#6343B8"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ borderRadius: 26, overflow: "hidden", padding: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", shadowColor: colors.violetStrong, shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.2, shadowRadius: 24, elevation: 7 }}
            >
              <View className="absolute -right-10 -top-16 h-44 w-44 rounded-full bg-lavender/25" />
              <View className="absolute -bottom-20 -left-12 h-40 w-40 rounded-full bg-white/5" />
              <View className="flex-row items-center justify-between">
                <Text className="text-[12px] font-semibold text-white/65">Balance</Text>
                <Text className="text-xs font-bold text-white/55">{total.currency}</Text>
              </View>
              <Text className="mt-3 text-[13px] font-medium text-white/65">{netMinor >= 0 ? "Friends owe you overall" : "You owe overall"}</Text>
              <Text className="mt-1 text-[34px] font-bold tracking-[-1px] text-white">{formatMoney(Math.abs(netMinor), total.currency)}</Text>
              <View className="my-4 h-px bg-white/15" />
              <View className="flex-row">
                <View className="flex-1 pr-4">
                  <View className="flex-row items-center gap-1.5">
                    <View className="h-2 w-2 rounded-full bg-coral" />
                    <Text className="text-xs font-medium text-white/60">You owe</Text>
                  </View>
                  <Text className="mt-1.5 text-[17px] font-bold text-white">{formatMoney(total.oweMinor, total.currency)}</Text>
                </View>
                <View className="w-px bg-white/15" />
                <View className="flex-1 pl-4">
                  <View className="flex-row items-center gap-1.5">
                    <View className="h-2 w-2 rounded-full bg-lime" />
                    <Text className="text-xs font-medium text-white/60">Owed to you</Text>
                  </View>
                  <Text className="mt-1.5 text-[17px] font-bold text-white">{formatMoney(total.owedMinor, total.currency)}</Text>
                </View>
              </View>
              <View className="mt-4 flex-row gap-2.5">
                <View className={plan.groups.length ? "flex-[1.2]" : "flex-1"}><Button label="Add entry" icon="plus" variant="bright" fullWidth onPress={() => setScopeVisible(true)} /></View>
                {plan.groups.length ? <View className="flex-1"><Button label="I paid" icon="send" variant="glass" fullWidth onPress={() => router.push("/settlement/new")} /></View> : null}
              </View>
            </LinearGradient>
          );
        })}
        {!totals.length ? (
          <View className="rounded-card border border-line bg-raised p-5">
            <Text className="font-semibold text-ink">No balances yet</Text>
            <Text className="mt-1 text-sm text-slate">Track what you owe or what is owed to you.</Text>
            <View className="mt-4"><Button label="Add entry" icon="plus" onPress={() => setScopeVisible(true)} /></View>
          </View>
        ) : null}
      </View>

      <View>
        <SectionHeader
          title="Your groups"
          detail={`${plan.groups.length} active ${plan.groups.length === 1 ? "circle" : "circles"}`}
          action={{ label: "New", icon: "plus", onPress: () => router.push("/group/new") }}
        />
        <View className="overflow-hidden rounded-card border border-line bg-raised shadow-sm shadow-black/5">
          {plan.groups.map((group, index) => (
            <Touch
              key={group.id}
              onPress={() => router.push({ pathname: "/group/[id]", params: { id: group.id } })}
              className={`flex-row items-center gap-3.5 px-4 py-4 ${index < plan.groups.length - 1 ? "border-b border-line" : ""}`}
              accessibilityRole="button"
              accessibilityLabel={`Open ${group.name}`}
            >
              <GroupAvatar name={group.name} accent={group.accent} />
              <View className="flex-1">
                <Text className="text-[15px] font-bold text-ink">{group.name}</Text>
                <Text className="mt-1 text-xs text-slate">{group.members.length} members · {group.role}</Text>
              </View>
              <View className="items-end pr-1">
                <Text className={`text-[14px] font-bold ${group.balanceMinor < 0 ? "text-coral" : "text-mint"}`}>
                  {group.balanceMinor < 0 ? "−" : "+"}{formatMoney(Math.abs(group.balanceMinor), group.currency)}
                </Text>
                <Text className="mt-1 text-[11px] text-slate">{group.balanceMinor < 0 ? "you owe" : "owed to you"}</Text>
              </View>
              <Icon name="chevron-right" size={18} color={colors.muted} />
            </Touch>
          ))}
        </View>
      </View>

      {plan.reviews.length ? (
        <View>
          <SectionHeader title="Needs your attention" detail="One tap to review payment proof" />
          <Touch
            onPress={() => router.push({ pathname: "/settlement/[id]", params: { id: plan.reviews[0]?.id ?? "" } })}
            className="overflow-hidden rounded-card border border-gold/20 bg-raised p-4 shadow-sm shadow-black/5"
            accessibilityRole="button"
          >
            <View className="flex-row items-center gap-3">
              <View className="h-12 w-12 items-center justify-center rounded-2xl bg-gold-soft">
                <Icon name="send" size={21} color={colors.gold} />
              </View>
              <View className="flex-1">
                <View className="mb-1 flex-row items-center gap-2">
                  <Text className="text-[15px] font-bold text-ink">{plan.reviews[0]?.debtor.name} paid?</Text>
                  <Badge label="Review" tone="warning" />
                </View>
                <Text className="text-xs text-slate">{plan.reviews[0]?.eventName} · {plan.reviews[0]?.eventDate ? formatShortDate(plan.reviews[0].eventDate) : "Today"}</Text>
              </View>
              <View className="items-end">
                <Text className="text-[15px] font-bold text-ink">{formatMoney(plan.reviews[0]?.amountMinor ?? 0, plan.reviews[0]?.currency)}</Text>
                <Icon name="arrow-right" size={17} color={colors.violet} />
              </View>
            </View>
          </Touch>
        </View>
      ) : null}
      <ExpenseScopeModal
        visible={scopeVisible}
        onClose={() => setScopeVisible(false)}
        onIndividual={() => {
          setScopeVisible(false);
          router.push("/transaction/new");
        }}
        onGroup={() => {
          setScopeVisible(false);
          router.push("/expense/new");
        }}
      />
    </View>
  );
}
