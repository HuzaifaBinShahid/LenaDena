import { useState } from "react";
import { Image, StyleSheet, useWindowDimensions, View } from "react-native";
import { Text } from "@/components/ui/Text";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { CHIP_MUTED, COMPACT_CARD, FormNoGroup, LayeredGroupCard } from "@/components/groups/LayeredGroupCard";
import { MemberRow } from "@/components/groups/MemberRow";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Screen } from "@/components/ui/Screen";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { groupSkin } from "@/features/groups/groupSkin";
import { useGroupInvite } from "@/features/groups/useGroupInvite";
import { useLedger } from "@/features/ledger/LedgerProvider";
import { getPlanState } from "@/features/ledger/planState";
import { useAppLock } from "@/features/security/AppLockProvider";
import { errorMessage } from "@/lib/api";
import { firstName, formatMoney, toMinorUnits } from "@/lib/format";
import { layout } from "@/theme/layout";

/** Screen padding (px-[18px] on each side). */
const SCREEN_GUTTER = 18;

export default function ClaimPaymentScreen() {
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  const { plan, connection, claimSettlement } = useLedger();
  const { runWithoutLocking } = useAppLock();
  const toast = useToast();
  const { width: windowWidth } = useWindowDimensions();
  const group = plan.groups.find((item) => item.id === groupId) ?? plan.groups[0];
  const recipients = group?.members.filter((member) => member.id !== plan.user.id) ?? [];
  const [recipientId, setRecipientId] = useState(recipients[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [proofUri, setProofUri] = useState<string>();
  const [saving, setSaving] = useState(false);
  const { invite, inviting } = useGroupInvite(group);
  const planState = getPlanState(plan, connection);
  const cardWidth = Math.min(windowWidth, layout.contentMax) - SCREEN_GUTTER * 2 - COMPACT_CARD.MARGIN_LEFT;
  const amountMinor = toMinorUnits(amount);
  const recipient = recipients.find((member) => member.id === recipientId);
  const noRecipients = recipients.length === 0;

  const chooseProof = () => runWithoutLocking(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.75, allowsEditing: true });
    if (!result.canceled && result.assets[0]?.uri) {
      setProofUri(result.assets[0].uri);
    }
  });

  const submit = async () => {
    const amountMinor = toMinorUnits(amount);
    if (!group || !recipientId || amountMinor <= 0) {
      toast.warning("Check the payment", "Choose who you paid and enter the amount you sent.");
      return;
    }
    const recipientName = recipients.find((member) => member.id === recipientId)?.name ?? "The recipient";
    setSaving(true);
    try {
      await claimSettlement({ groupId: group.id, recipientMemberId: recipientId, amountMinor, note: note.trim() || undefined, proofUri });
      router.replace({ pathname: "/", params: { tab: "reviews" } });
      toast.success("Payment sent for review", `${recipientName} can confirm it. Track it here under Payments.`);
    } catch (error) {
      toast.error("Couldn't submit the payment", errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (!group) {
    return (
      <Screen>
        <PageHeader title="I paid" subtitle="Money moves outside LenaDena" />
        {planState === "loading" ? (
          <View style={styles.loading}>
            <Spinner />
            <Text className="text-[13px] font-semibold text-slate">Loading your groups</Text>
          </View>
        ) : (
          <FormNoGroup
            cardWidth={cardWidth}
            title="Payments need a group"
            detail="I paid confirms a payment inside a group. Create one, or track this as an individual entry with one person."
          />
        )}
      </Screen>
    );
  }

  const skin = groupSkin(group.accent);
  const confirmation = recipient ? `Needs ${firstName(recipient.name) || recipient.name}'s confirmation` : "Needs confirmation";

  return (
    <Screen>
      <PageHeader title="I paid" subtitle="Money moves outside LenaDena" />
      <View style={styles.card}>
        <LayeredGroupCard
          variant="compact"
          width={cardWidth}
          height={COMPACT_CARD.HEIGHT}
          skin={skin}
          art="full"
          glyph="users"
          name={group.name}
          currency={group.currency}
          label="Amount sent"
          amount={formatMoney(amountMinor, group.currency)}
          chip={{ icon: "clock", label: confirmation, color: CHIP_MUTED }}
          accessibilityLabel={`${group.name}. Amount sent ${formatMoney(amountMinor, group.currency)}. ${confirmation}.`}
        />
      </View>
      <View className="gap-6">
        <Field label="Paid to" required>
          {noRecipients ? (
            <MemberRow
              group={group}
              currentUserId={plan.user.id}
              mode="radio"
              onInvite={() => void invite()}
              inviting={inviting}
              caption={`No one else is in ${group.name} yet`}
              style={styles.breakout}
            />
          ) : (
            <MemberRow
              group={group}
              currentUserId={plan.user.id}
              mode="radio"
              selectedIds={recipientId ? [recipientId] : []}
              onToggle={setRecipientId}
              style={styles.breakout}
            />
          )}
        </Field>
        <Field label="Amount sent" required>
          <Input value={amount} onChangeText={setAmount} placeholder="2400" keyboardType="decimal-pad" leadingIcon="credit-card" />
        </Field>
        <Field label="Payment note" hint="Optional: bank transfer, cash, reference ending 1842.">
          <Input value={note} onChangeText={setNote} placeholder="Bank transfer" multiline />
        </Field>
        <Field label="Proof screenshot" hint="Optional and private to you and the recipient. Crop sensitive details before attaching.">
          {proofUri ? <Image source={{ uri: proofUri }} className="h-56 w-full rounded-card bg-gray-100" resizeMode="contain" /> : null}
          <View className="mt-2 flex-row gap-3">
            <Button label={proofUri ? "Replace proof" : "Attach proof"} icon="image" variant="secondary" onPress={chooseProof} />
            {proofUri ? <Button label="Remove" icon="trash-2" variant="ghost" onPress={() => setProofUri(undefined)} /> : null}
          </View>
        </Field>
        <View className="gap-3">
          <Button label="Submit for review" icon="send" fullWidth size="lg" loading={saving} disabled={noRecipients} onPress={submit} />
          <Text className="px-1 text-center text-xs leading-4 text-slate">The recipient confirms this claim. If they have never opened LenaDena, or don't respond within 72 hours, you can settle it yourself with a clear label.</Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    marginLeft: COMPACT_CARD.MARGIN_LEFT,
    marginTop: 2,
    marginBottom: 26,
  },
  breakout: {
    marginHorizontal: -SCREEN_GUTTER,
  },
  loading: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 40,
  },
});
