import { useState } from "react";
import { Image, View } from "react-native";
import { Text } from "@/components/ui/Text";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Screen } from "@/components/ui/Screen";
import { TopTabs } from "@/components/ui/TopTabs";
import { useToast } from "@/components/ui/Toast";
import { useLedger } from "@/features/ledger/LedgerProvider";
import { useAppLock } from "@/features/security/AppLockProvider";
import { errorMessage } from "@/lib/api";
import { toMinorUnits } from "@/lib/format";

export default function ClaimPaymentScreen() {
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  const { plan, claimSettlement } = useLedger();
  const { runWithoutLocking } = useAppLock();
  const toast = useToast();
  const group = plan.groups.find((item) => item.id === groupId) ?? plan.groups[0];
  const recipients = group?.members.filter((member) => member.id !== plan.user.id) ?? [];
  const [recipientId, setRecipientId] = useState(recipients[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [proofUri, setProofUri] = useState<string>();
  const [saving, setSaving] = useState(false);

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

  return (
    <Screen>
      <PageHeader title="I paid" subtitle="Money moves outside LenaDena" />
      <View className="gap-6">
        <Field label="Paid to" required>
          <TopTabs tabs={recipients.map((member) => ({ key: member.id, label: member.name }))} value={recipientId} onChange={setRecipientId} />
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
          <Button label="Submit for review" icon="send" fullWidth size="lg" loading={saving} onPress={submit} />
          <Text className="px-1 text-center text-xs leading-4 text-slate">The recipient confirms this claim. If they have never opened LenaDena, or don't respond within 72 hours, you can settle it yourself with a clear label.</Text>
        </View>
      </View>
    </Screen>
  );
}
