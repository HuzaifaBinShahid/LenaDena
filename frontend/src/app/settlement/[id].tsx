import { useState } from "react";
import { Alert, Image, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { router, useLocalSearchParams } from "expo-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Screen } from "@/components/ui/Screen";
import { useLedger } from "@/features/ledger/LedgerProvider";
import { formatMoney, formatShortDate } from "@/lib/format";

export default function SettlementReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { plan, reviewSettlement } = useLedger();
  const review = plan.reviews.find((item) => item.id === id);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState<"confirm" | "attention" | null>(null);

  if (!review) {
    return (
      <Screen>
        <PageHeader title="Payment review" />
        <Text className="text-slate">This review is already resolved or is no longer available.</Text>
      </Screen>
    );
  }

  const decide = async (decision: "confirm" | "attention") => {
    setSaving(decision);
    try {
      await reviewSettlement(review.id, decision === "confirm" ? "confirmed" : "needs_attention", note.trim() || undefined);
      router.replace("/");
    } catch (error) {
      Alert.alert("Could not update payment", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <Screen>
      <PageHeader title="Payment review" subtitle="Only you can close this balance" />
      <View className="gap-6">
        <View className="rounded-card border border-line bg-raised p-5">
          <Badge label="Awaiting your review" tone="warning" />
          <Text className="mt-5 text-2xl font-bold text-ink">{review.debtor.name} says they paid</Text>
          <Text className="mt-2 text-4xl font-bold tracking-tight text-ink">{formatMoney(review.amountMinor, review.currency)}</Text>
          <View className="mt-5 gap-3 border-t border-line pt-5">
            <View className="flex-row justify-between gap-4"><Text className="text-sm text-slate">Group</Text><Text className="text-sm font-bold text-ink">{plan.groups.find((group) => group.id === review.groupId)?.name}</Text></View>
            <View className="flex-row justify-between gap-4"><Text className="text-sm text-slate">Event</Text><Text className="text-sm font-bold text-ink">{review.eventName ?? "Settlement"}</Text></View>
            {review.eventDate ? <View className="flex-row justify-between gap-4"><Text className="text-sm text-slate">Date</Text><Text className="text-sm font-bold text-ink">{formatShortDate(review.eventDate)}</Text></View> : null}
            {review.note ? <View className="flex-row justify-between gap-4"><Text className="text-sm text-slate">Payment note</Text><Text className="text-sm font-bold text-ink">{review.note}</Text></View> : null}
          </View>
        </View>

        {review.proofUri ? (
          <View>
            <Text className="mb-3 text-lg font-bold text-ink">Private proof</Text>
            <Image source={{ uri: review.proofUri }} className="h-64 w-full rounded-card bg-gray-100" resizeMode="contain" />
          </View>
        ) : (
          <View className="rounded-card bg-gray-100 p-5">
            <Text className="font-bold text-ink">No screenshot attached</Text>
            <Text className="mt-2 text-sm leading-5 text-slate">Proof is optional. Confirm only after the money appears in your account or reaches you in cash.</Text>
          </View>
        )}

        <Field label="Private reply" hint="Required only when the payment needs attention.">
          <Input value={note} onChangeText={setNote} placeholder="Wrong amount, unclear proof, or money not received" multiline />
        </Field>
        <Button label="Money received" icon="check-circle" size="lg" fullWidth loading={saving === "confirm"} disabled={Boolean(saving)} onPress={() => decide("confirm")} />
        <Button label="Needs attention" icon="alert-circle" size="lg" fullWidth variant="danger" loading={saving === "attention"} disabled={Boolean(saving)} onPress={() => decide("attention")} />
        <Text className="text-center text-xs leading-4 text-slate">Confirming posts one ledger event. Repeated taps and retries cannot post it twice.</Text>
      </View>
    </Screen>
  );
}
