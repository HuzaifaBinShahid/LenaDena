import { useState } from "react";
import { Alert, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { router, useLocalSearchParams } from "expo-router";
import { BrandMark } from "@/components/brand/BrandMark";
import { Button } from "@/components/ui/Button";
import { Screen } from "@/components/ui/Screen";
import { useAuth } from "@/features/auth/AuthProvider";
import { useLedger } from "@/features/ledger/LedgerProvider";

export default function AcceptInviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { configured, session } = useAuth();
  const { acceptInvite } = useLedger();
  const [joining, setJoining] = useState(false);

  const join = async () => {
    if (!token) return;
    setJoining(true);
    try {
      const group = await acceptInvite(token);
      router.replace({ pathname: "/group/[id]", params: { id: group.id } });
    } catch (error) {
      Alert.alert("Could not join group", error instanceof Error ? error.message : "The invite may be invalid or expired.");
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
