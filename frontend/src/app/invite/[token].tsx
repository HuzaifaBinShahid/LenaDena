import { useState } from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/Text";
import { router, useLocalSearchParams } from "expo-router";
import { BrandMark } from "@/components/brand/BrandMark";
import { Button } from "@/components/ui/Button";
import { Screen } from "@/components/ui/Screen";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/features/auth/AuthProvider";
import { useLedger } from "@/features/ledger/LedgerProvider";
import { errorMessage } from "@/lib/api";

export default function AcceptInviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { configured, session } = useAuth();
  const { acceptInvite } = useLedger();
  const toast = useToast();
  const [joining, setJoining] = useState(false);

  const join = async () => {
    if (!token) return;
    setJoining(true);
    try {
      const group = await acceptInvite(token);
      router.replace({ pathname: "/group/[id]", params: { id: group.id } });
      toast.success(`You joined ${group.name}`, "Shared expenses and balances for this group now appear in your plan.");
    } catch (error) {
      toast.error("Couldn't join the group", errorMessage(error, "The invite may be invalid or expired."));
    } finally {
      setJoining(false);
    }
  };

  return (
    <Screen>
      <View className="items-center pb-8 pt-10"><BrandMark size="lg" /></View>
      <View className="rounded-card border border-line bg-raised p-6">
        <Text className="text-2xl font-bold text-ink">You have been invited</Text>
        <Text className="mt-3 text-base leading-6 text-slate">Join this LenaDena group to see only your own plan, add shared expenses, and settle balances with receipt confirmation.</Text>
        <View className="mt-7">
          {configured && !session ? (
            <Button label="Sign in to join" icon="mail" size="lg" fullWidth onPress={() => router.push({ pathname: "/auth", params: { next: `/invite/${token}` } })} />
          ) : (
            <Button label="Join group" icon="user-plus" size="lg" fullWidth loading={joining} onPress={join} />
          )}
        </View>
      </View>
    </Screen>
  );
}
