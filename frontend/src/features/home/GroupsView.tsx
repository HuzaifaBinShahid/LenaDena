import { View } from "react-native";
import { Text } from "@/components/ui/Text";
import { router } from "expo-router";
import { Button } from "@/components/ui/Button";
import { GroupAvatar } from "@/components/ui/GroupAvatar";
import { Icon } from "@/components/ui/Icon";
import { Touch } from "@/components/ui/Touch";
import { useLedger } from "@/features/ledger/LedgerProvider";
import { formatMoney } from "@/lib/format";
import { colors } from "@/theme/tokens";

export function GroupsView() {
  const { plan } = useLedger();
  return (
    <View className="gap-5 px-[18px] py-5">
      <View className="flex-row items-center justify-between gap-4">
        <View className="flex-1">
          <Text className="text-[26px] font-bold tracking-tight text-ink">Groups</Text>
          <Text className="mt-1 text-[13px] text-slate">Every circle keeps its own clean ledger.</Text>
        </View>
        <Button label="New group" icon="plus" size="sm" onPress={() => router.push("/group/new")} />
      </View>
      <View className="gap-3">
        {plan.groups.map((group) => (
          <Touch
            key={group.id}
            onPress={() => router.push({ pathname: "/group/[id]", params: { id: group.id } })}
            className="rounded-card border border-line bg-raised p-4 shadow-sm shadow-black/5"
            accessibilityRole="button"
          >
            <View className="flex-row items-center gap-3">
              <GroupAvatar name={group.name} accent={group.accent} size="lg" />
              <View className="flex-1">
                <View className="flex-row items-center gap-2">
                  <Text className="text-[17px] font-bold text-ink">{group.name}</Text>
                  <View className="rounded-full bg-surface px-2 py-1">
                    <Text className="text-[10px] font-semibold capitalize text-slate">{group.role}</Text>
                  </View>
                </View>
                <Text numberOfLines={1} className="mt-1 text-xs text-slate">{group.members.map((member) => member.name).join(" · ")}</Text>
              </View>
              <Icon name="chevron-right" size={19} color={colors.muted} />
            </View>
            <View className="mt-4 flex-row items-center justify-between rounded-2xl bg-canvas px-4 py-3">
              <View className="flex-row items-center gap-2">
                <View className={`h-2 w-2 rounded-full ${group.balanceMinor < 0 ? "bg-coral" : "bg-mint"}`} />
                <Text className="text-xs font-medium text-slate">{group.balanceMinor < 0 ? "You need to send" : "Coming back to you"}</Text>
              </View>
              <Text className={`text-[15px] font-bold ${group.balanceMinor < 0 ? "text-coral" : "text-mint"}`}>
                {formatMoney(Math.abs(group.balanceMinor), group.currency)}
              </Text>
            </View>
          </Touch>
        ))}
      </View>
    </View>
  );
}
