import { useState } from "react";
import { Alert, Image, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useLedger } from "@/features/ledger/LedgerProvider";
import { errorMessage } from "@/lib/api";
import { formatDateTime, formatMoney, formatShortDate } from "@/lib/format";
import { colors } from "@/theme/tokens";

export default function SettlementReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { plan, reviewSettlement, selfConfirmSettlement } = useLedger();
  const toast = useToast();
  const incoming = plan.reviews.find((item) => item.id === id);
  const claim = plan.claims.find((item) => item.id === id);
  const payment = incoming ?? claim;
  const sentByUser = Boolean(claim);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState<"confirm" | "attention" | "settle" | null>(null);

  if (!payment) {
    return (
      <Screen>
        <PageHeader title="Payment" />
        <Text className="text-slate">This payment is already resolved or is no longer available.</Text>
      </Screen>
    );
  }

  const decide = async (decision: "confirm" | "attention") => {
    setSaving(decision);
    try {
      await reviewSettlement(payment.id, decision === "confirm" ? "confirmed" : "needs_attention", note.trim() || undefined);
      router.replace({ pathname: "/", params: { tab: "reviews" } });
      if (decision === "confirm") {
        toast.success("Payment confirmed", `${formatMoney(payment.amountMinor, payment.currency)} from ${payment.debtor.name} is now settled.`);
      } else {
        toast.info("Marked as needs attention", `${payment.debtor.name} will see that this payment needs a follow-up.`);
      }
    } catch (error) {
      toast.error("Couldn't update the payment", errorMessage(error));
    } finally {
      setSaving(null);
    }
  };

  const settle = () => {
    Alert.alert(
      "Mark this payment as settled?",
      `${payment.recipient.name} will be notified. LenaDena will record that you closed it using the payer fallback, not a recipient confirmation.`,
      [
        { text: "Keep waiting", style: "cancel" },
        {
          text: "Mark settled",
          onPress: async () => {
            setSaving("settle");
            try {
              await selfConfirmSettlement(payment.id);
              router.replace({ pathname: "/", params: { tab: "reviews" } });
              toast.success("Payment settled", `Recorded as settled by you. ${payment.recipient.name} has been notified.`);
            } catch (error) {
              toast.error("Couldn't settle the payment", errorMessage(error));
            } finally {
              setSaving(null);
            }
          },
        },
      ],
    );
  };

  const counterpart = sentByUser ? payment.recipient : payment.debtor;
  const groupName = plan.groups.find((group) => group.id === payment.groupId)?.name ?? "Group";

  return (
    <Screen>
      <PageHeader
        title={sentByUser ? "Payment status" : "Payment review"}
        subtitle={sentByUser ? `Waiting for ${payment.recipient.name}` : "Only you can confirm money received"}
      />
      <View className="gap-6">
        <View className="rounded-card border border-line bg-raised p-5">
          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-row items-center gap-3">
              <Avatar name={counterpart.name} uri={counterpart.avatarUrl} />
              <View>
                <Text className="text-xs text-slate">{sentByUser ? "Payment sent to" : "Payment from"}</Text>
                <Text className="mt-0.5 font-bold text-ink">{counterpart.name}</Text>
              </View>
            </View>
            <Badge
              label={sentByUser ? payment.canSelfSettle ? "Can settle" : "Pending" : "Review now"}
              tone={sentByUser ? payment.canSelfSettle ? "positive" : "neutral" : "warning"}
            />
          </View>
          <Text className="mt-6 text-[13px] text-slate">{sentByUser ? "You marked this as paid" : `${payment.debtor.name} marked this as paid`}</Text>
          <Text className="mt-1 text-4xl font-bold tracking-tight text-ink">{formatMoney(payment.amountMinor, payment.currency)}</Text>
          <View className="mt-5 gap-3 border-t border-line pt-5">
            <View className="flex-row justify-between gap-4"><Text className="text-sm text-slate">Group</Text><Text className="text-sm font-bold text-ink">{groupName}</Text></View>
            <View className="flex-row justify-between gap-4"><Text className="text-sm text-slate">Entry</Text><Text className="text-sm font-bold text-ink">{payment.eventName ?? "Balance payment"}</Text></View>
            {payment.eventDate ? <View className="flex-row justify-between gap-4"><Text className="text-sm text-slate">Date</Text><Text className="text-sm font-bold text-ink">{formatShortDate(payment.eventDate)}</Text></View> : null}
            {payment.note ? <View className="flex-row justify-between gap-4"><Text className="text-sm text-slate">Payment note</Text><Text className="max-w-[65%] text-right text-sm font-bold text-ink">{payment.note}</Text></View> : null}
          </View>
        </View>

        {payment.proofUri ? (
          <View>
            <Text className="mb-3 text-lg font-bold text-ink">Private proof</Text>
            <Image source={{ uri: payment.proofUri }} className="h-64 w-full rounded-card bg-gray-100" resizeMode="contain" />
          </View>
        ) : (
          <View className="rounded-card bg-gray-100 p-5">
            <Text className="font-bold text-ink">No screenshot attached</Text>
            <Text className="mt-2 text-sm leading-5 text-slate">Proof is optional. The settlement record still keeps who submitted it and when.</Text>
          </View>
        )}

        {sentByUser ? (
          <View className="rounded-card border border-line bg-raised p-5">
            <View className="flex-row items-start gap-3">
              <View className={`h-10 w-10 items-center justify-center rounded-2xl ${payment.canSelfSettle ? "bg-mint-soft" : "bg-violet-soft"}`}>
                <Icon name={payment.canSelfSettle ? "check-circle" : "clock"} size={21} color={payment.canSelfSettle ? colors.mint : colors.violet} />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="font-bold text-ink">{payment.canSelfSettle ? "Fallback settlement is available" : "Recipient review is still open"}</Text>
                <Text className="mt-2 text-sm leading-5 text-slate">
                  {!payment.recipientHasOpenedApp
                    ? `${payment.recipient.name} has not opened LenaDena, so you can close this now.`
                    : payment.canSelfSettle
                      ? "The 72-hour review window has ended. You can close this without waiting longer."
                      : `${payment.recipient.name} can confirm this until ${payment.selfSettleAvailableAt ? formatDateTime(payment.selfSettleAvailableAt) : "the review window ends"}.`}
                </Text>
              </View>
            </View>
            {payment.canSelfSettle ? <View className="mt-5"><Button label="Mark as settled" icon="check-circle" fullWidth loading={saving === "settle"} disabled={Boolean(saving)} onPress={settle} /></View> : null}
            <Text className="mt-4 text-[11px] leading-4 text-slate">Fallback settlement is labeled in history and the recipient is notified. It is never shown as their confirmation.</Text>
          </View>
        ) : (
          <>
            <Field label="Private reply" hint="Required only when the payment needs attention.">
              <Input value={note} onChangeText={setNote} placeholder="Wrong amount, unclear proof, or money not received" multiline />
            </Field>
            <Button label="Money received" icon="check-circle" size="lg" fullWidth loading={saving === "confirm"} disabled={Boolean(saving)} onPress={() => decide("confirm")} />
            <Button label="Needs attention" icon="alert-circle" size="lg" fullWidth variant="danger" loading={saving === "attention"} disabled={Boolean(saving)} onPress={() => decide("attention")} />
            <Text className="text-center text-xs leading-4 text-slate">Confirming posts one ledger event. Repeated taps and retries cannot post it twice.</Text>
          </>
        )}
      </View>
    </Screen>
  );
}
