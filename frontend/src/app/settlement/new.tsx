import { useState } from "react";
import { Alert, Image, View } from "react-native";
import { Text } from "@/components/ui/Text";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Screen } from "@/components/ui/Screen";
import { TopTabs } from "@/components/ui/TopTabs";
import { useLedger } from "@/features/ledger/LedgerProvider";
import { toMinorUnits } from "@/lib/format";

export default function ClaimPaymentScreen() {
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  const { plan, claimSettlement } = useLedger();
  const group = plan.groups.find((item) => item.id === groupId) ?? plan.groups[0];
  const recipients = group?.members.filter((member) => member.id !== plan.user.id) ?? [];
  const [recipientId, setRecipientId] = useState(recipients[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [proofUri, setProofUri] = useState<string>();
  const [saving, setSaving] = useState(false);

  const chooseProof = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.75, allowsEditing: true });
    if (!result.canceled && result.assets[0]?.uri) {
      setProofUri(result.assets[0].uri);
    }
  };

  const submit = async () => {
    const amountMinor = toMinorUnits(amount);
    if (!group || !recipientId || amountMinor <= 0) {
      Alert.alert("Check payment", "Choose a recipient and enter the amount you sent.");
      return;
    }
    setSaving(true);
    try {
      await claimSettlement({ groupId: group.id, recipientMemberId: recipientId, amountMinor, note: note.trim() || undefined, proofUri });
      Alert.alert("Payment sent for review", "Reminders are paused while the recipient checks it.", [{ text: "Done", onPress: () => router.replace("/") }]);
    } catch (error) {
      Alert.alert("Could not submit payment", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <PageHeader title="I paid" subtitle="Money moves outside OweYaar" />
      <View className="gap-6">
        <View className="rounded-card bg-gold-soft p-5">
          <Text className="font-bold text-ink">This is a payment claim</Text>
          <Text className="mt-2 text-sm leading-5 text-slate">Your balance changes only after the recipient taps Money received.</Text>
        </View>
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
        <Button label="Submit for review" icon="send" fullWidth size="lg" loading={saving} onPress={submit} />
      </View>
    </Screen>
  );
}
