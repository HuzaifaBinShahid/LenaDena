import { useState } from "react";
import { Alert, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { router } from "expo-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { Screen } from "@/components/ui/Screen";
import { TopTabs } from "@/components/ui/TopTabs";
import { Touch } from "@/components/ui/Touch";
import { useLedger } from "@/features/ledger/LedgerProvider";
import { colors } from "@/theme/tokens";

const accents = ["#6657E8", "#168AAD", "#16A77E", "#E88B3D", "#EC6075"];

export default function CreateGroupScreen() {
  const { createGroup } = useLedger();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState<"PKR" | "USD" | "EUR">("PKR");
  const [emails, setEmails] = useState("");
  const [accent, setAccent] = useState(accents[0] ?? colors.violet);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const nameError = submitted && name.trim().length < 2 ? "Enter a group name." : undefined;

  const save = async () => {
    setSubmitted(true);
    if (name.trim().length < 2) {
      return;
    }
    setSaving(true);
    try {
      await createGroup({
        name: name.trim(),
        currency,
        accent,
        inviteEmails: emails.split(/[\s,]+/).map((email) => email.trim().toLowerCase()).filter(Boolean),
      });
      router.back();
    } catch (error) {
      Alert.alert("Could not create group", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <PageHeader title="Create group" subtitle="You will be the group owner" />
      <View className="gap-6">
        <Field label="Group name" required error={nameError}>
          <Input value={name} onChangeText={setName} placeholder="Weekend crew" maxLength={80} autoFocus invalid={Boolean(nameError)} />
        </Field>
        <Field label="Currency" required hint="A group uses one currency at launch.">
          <TopTabs
            tabs={[{ key: "PKR", label: "PKR" }, { key: "USD", label: "USD" }, { key: "EUR", label: "EUR" }]}
            value={currency}
            onChange={setCurrency}
          />
        </Field>
        <Field label="Invite friends" hint="Separate email addresses with commas. You can invite more people later.">
          <Input value={emails} onChangeText={setEmails} placeholder="sara@example.com, hamza@example.com" keyboardType="email-address" autoCapitalize="none" multiline />
        </Field>
        <Field label="Group accent" hint="Accent changes decoration only, never financial status colors.">
          <View className="flex-row gap-3">
            {accents.map((value) => (
              <Touch
                key={value}
                onPress={() => setAccent(value)}
                haptic
                accessibilityRole="radio"
                accessibilityState={{ checked: value === accent }}
                accessibilityLabel={`Choose ${value} group accent`}
                className={`h-12 w-12 items-center justify-center rounded-2xl border-2 ${value === accent ? "border-ink" : "border-transparent"}`}
              >
                <View className="h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: value }}>
                  {value === accent ? <Icon name="check" size={18} color={colors.white} /> : null}
                </View>
              </Touch>
            ))}
          </View>
        </Field>
        <View className="rounded-card bg-violet-soft p-5">
          <Text className="font-bold text-ink">You stay in control</Text>
          <Text className="mt-2 text-sm leading-5 text-slate">You can invite members, appoint an admin, archive the group, or transfer ownership later.</Text>
        </View>
        <Button label="Create group" icon="users" size="lg" fullWidth loading={saving} onPress={save} />
      </View>
    </Screen>
  );
}
