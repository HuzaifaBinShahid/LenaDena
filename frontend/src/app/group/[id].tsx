import { Share, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { Screen } from "@/components/ui/Screen";
import { useToast } from "@/components/ui/Toast";
import { useLedger } from "@/features/ledger/LedgerProvider";
import { useAppLock } from "@/features/security/AppLockProvider";
import { errorMessage } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { colors } from "@/theme/tokens";

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { plan, createInvite } = useLedger();
  const { runWithoutLocking } = useAppLock();
  const toast = useToast();
  const group = plan.groups.find((item) => item.id === id);

  if (!group) {
    return (
      <Screen>
        <PageHeader title="Group" />
        <Text className="text-slate">This group is not available.</Text>
      </Screen>
    );
  }

  const shareInvite = async () => {
    try {
      const invite = await createInvite(group.id);
      await runWithoutLocking(() => Share.share({
        title: `Join ${group.name}`,
        message: `Join ${group.name} on LenaDena: ${invite.url}`,
      }));
    } catch (error) {
      toast.error("Couldn't create an invite", errorMessage(error));
    }
  };

  return (
    <Screen>
      <PageHeader title={group.name} subtitle={`${group.members.length} members · ${group.currency}`} />
      <View className="gap-6">
        <LinearGradient colors={[colors.inkSoft, colors.ink]} style={{ borderRadius: 22, overflow: "hidden", padding: 20 }}>
          <View className="absolute -right-12 -top-16 h-40 w-40 rounded-full bg-violet/25" />
          <Text className="text-xs font-semibold uppercase tracking-[1.2px] text-white/50">Your position</Text>
          <Text className="mt-2 text-[30px] font-bold tracking-tight text-white">
            {group.balanceMinor < 0 ? "You owe " : "You get "}{formatMoney(Math.abs(group.balanceMinor), group.currency)}
          </Text>
          <View className="mt-5 flex-row gap-2.5">
            <View className="flex-1"><Button label="Add expense" icon="plus" variant="bright" fullWidth onPress={() => router.push({ pathname: "/expense/new", params: { groupId: group.id } })} /></View>
            <View className="flex-1"><Button label="I paid" icon="send" variant="secondary" fullWidth onPress={() => router.push({ pathname: "/settlement/new", params: { groupId: group.id } })} /></View>
          </View>
        </LinearGradient>
        <Button label="Invite friends" icon="user-plus" variant="secondary" fullWidth onPress={shareInvite} />

        <View>
          <SectionHeader title="Members" detail={`${group.members.length} people in this circle`} />
          <View className="rounded-card border border-line bg-raised px-4 shadow-sm shadow-black/5">
            {group.members.map((member, index) => (
              <View key={member.id} className={`flex-row items-center gap-3 py-4 ${index < group.members.length - 1 ? "border-b border-line" : ""}`}>
                <Avatar name={member.name} uri={member.avatarUrl} size="sm" accent={group.accent} />
                <View className="flex-1">
                  <Text className="font-bold text-ink">{member.name}</Text>
                  <Text className="mt-1 text-xs text-slate">{member.email}</Text>
                </View>
                {member.id === plan.user.id ? <Icon name="star" size={18} color={colors.gold} /> : null}
              </View>
            ))}
          </View>
        </View>
      </View>
    </Screen>
  );
}
