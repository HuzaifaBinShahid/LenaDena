import { useEffect, useMemo, useRef, useState } from "react";
import { Image, Platform, StyleSheet, useWindowDimensions, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { CHIP_MUTED, COMPACT_CARD, FormNoGroup, LayeredGroupCard } from "@/components/groups/LayeredGroupCard";
import { MemberRow } from "@/components/groups/MemberRow";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EntryTile } from "@/components/ui/EntryTile";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { LedgerList, LedgerRow } from "@/components/ui/LedgerRow";
import { PageHeader } from "@/components/layout/PageHeader";
import { Screen } from "@/components/ui/Screen";
import { Spinner } from "@/components/ui/Spinner";
import { Text } from "@/components/ui/Text";
import { TopTabs } from "@/components/ui/TopTabs";
import { useToast } from "@/components/ui/Toast";
import { recognizeReceipt } from "@/features/capture/ocr";
import { speechUnavailableMessage, startOnDeviceSpeech, type SpeechSession } from "@/features/capture/speech";
import { groupSkin } from "@/features/groups/groupSkin";
import { getPlanState } from "@/features/ledger/planState";
import { calculateShares } from "@/features/ledger/split";
import { useLedger } from "@/features/ledger/LedgerProvider";
import type { SplitMethod } from "@/features/ledger/types";
import { useAppLock } from "@/features/security/AppLockProvider";
import { errorMessage } from "@/lib/api";
import { dateFromIso, dateToIso, formatLongDate, formatMoney, toMinorUnits, todayDate } from "@/lib/format";
import { usePreferences } from "@/features/preferences/PreferencesProvider";
import { layout } from "@/theme/layout";
import { colors } from "@/theme/tokens";

type FormStep = "details" | "split" | "finish";

const formSteps = [
  { key: "details" as const, label: "Details", icon: "file-text" as const },
  { key: "split" as const, label: "Split", icon: "users" as const },
  { key: "finish" as const, label: "Finish", icon: "check-circle" as const },
];

const stepRank: Record<FormStep, number> = { details: 0, split: 1, finish: 2 };

/** Screen padding (px-[18px] on each side). */
const SCREEN_GUTTERS = 36;

export default function NewExpenseScreen() {
  const params = useLocalSearchParams<{ groupId?: string; receiptUri?: string }>();
  const { plan, connection, createExpense } = useLedger();
  const { speechLocale, palette } = usePreferences();
  const { width: windowWidth } = useWindowDimensions();
  const { runWithoutLocking } = useAppLock();
  const toast = useToast();
  const [step, setStep] = useState<FormStep>("details");
  const [groupId, setGroupId] = useState(params.groupId ?? plan.groups[0]?.id ?? "");
  const group = plan.groups.find((item) => item.id === groupId) ?? plan.groups[0];
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState(todayDate());
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [method, setMethod] = useState<SplitMethod>("equal");
  const [receiptUri, setReceiptUri] = useState(params.receiptUri);
  const [selectedIds, setSelectedIds] = useState<string[]>(group?.members.map((member) => member.id) ?? []);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [listeningField, setListeningField] = useState<"event" | "note" | null>(null);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const speech = useRef<SpeechSession | null>(null);
  const amountMinor = toMinorUnits(amount);
  const participants = group?.members.filter((member) => selectedIds.includes(member.id)) ?? [];
  const pickerDate = dateFromIso(eventDate);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(eventDate) && !Number.isNaN(pickerDate.getTime());

  const shares = useMemo(
    () => calculateShares(amountMinor, participants.map((member) => member.id), method, allocations),
    [allocations, amountMinor, method, participants],
  );
  const allocatedMinor = shares.reduce((sum, share) => sum + share.amountMinor, 0);
  const percentageTotal = method === "percentage" ? shares.reduce((sum, share) => sum + (share.percentageBasisPoints ?? 0), 0) : 10000;
  const nonNegativeAllocation = shares.every((share) => share.amountMinor >= 0 && (share.percentageBasisPoints ?? 0) >= 0);
  const validAllocation = method === "equal" || (allocatedMinor === amountMinor && percentageTotal === 10000 && nonNegativeAllocation);
  const detailsValid = Boolean(group && eventName.trim() && validDate && amountMinor > 0);
  const splitValid = participants.length > 0 && validAllocation;
  const eventError = submitted && !eventName.trim() ? "Event name is required." : undefined;
  const dateError = submitted && !validDate ? "Choose a valid date." : undefined;
  const amountError = submitted && amountMinor <= 0 ? "Enter an amount greater than zero." : undefined;
  const planState = getPlanState(plan, connection);
  const cardWidth = Math.min(windowWidth, layout.contentMax) - SCREEN_GUTTERS - COMPACT_CARD.MARGIN_LEFT;
  // Everyone else's shares come back to you, because you are the payer.
  const getBackMinor = Math.max(0, shares.reduce((sum, share) => (share.memberId === plan.user.id ? sum : sum + share.amountMinor), 0));
  const splitSummary = `${participants.length} ${participants.length === 1 ? "person" : "people"} · ${method === "equal" ? "Equal" : method === "exact" ? "By value" : "By percentage"}`;

  const listen = async (field: "event" | "note") => {
    if (listeningField) {
      speech.current?.stop();
      return;
    }
    const unavailableMessage = speechUnavailableMessage();
    if (unavailableMessage) {
      toast.info("Voice needs a development build", unavailableMessage);
      return;
    }
    let reportedError = false;
    setListeningField(field);
    // Android pauses the app for the microphone permission dialog; that must not trigger the app lock.
    const session = await runWithoutLocking(() => startOnDeviceSpeech(
      speechLocale,
      (text) => field === "event" ? setEventName(text) : setNote(text),
      () => setListeningField(null),
      (message) => {
        reportedError = true;
        setListeningField(null);
        toast.warning("Voice input stopped", message);
      },
    ));
    if (!session) {
      setListeningField(null);
      if (!reportedError) toast.info("On-device voice unavailable", "Use the keyboard, or a development build on a device with a downloaded speech model.");
    }
    speech.current = session;
  };

  const scan = async (uri: string) => {
    setScanning(true);
    const result = await recognizeReceipt(uri);
    setScanning(false);
    if (!result.available) {
      toast.info("Receipt attached", "Scanning isn't available here, so enter the amount and date yourself.");
      return;
    }
    const { amount: suggestedAmount, date, eventName: suggestedName } = result.suggestions;
    if (suggestedAmount) setAmount(suggestedAmount);
    if (date) setEventDate(date);
    if (suggestedName) setEventName(suggestedName);
    if (suggestedAmount || date || suggestedName) toast.success("Receipt scanned", "Check the suggested details before saving.");
    else toast.info("Couldn't read this receipt", "It's attached. Enter the details yourself.");
  };

  useEffect(() => {
    if (params.receiptUri) void scan(params.receiptUri);
  }, [params.receiptUri]);

  useEffect(() => () => speech.current?.cancel(), []);

  const chooseReceipt = async () => {
    const result = await runWithoutLocking(() => ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, allowsEditing: true }));
    if (!result.canceled && result.assets[0]?.uri) {
      const uri = result.assets[0].uri;
      setReceiptUri(uri);
      await scan(uri);
    }
  };

  const goToStep = (next: FormStep) => {
    if (stepRank[next] <= stepRank[step]) {
      setStep(next);
      return;
    }
    setSubmitted(true);
    if (!detailsValid) {
      setStep("details");
      return;
    }
    if (next === "finish" && !splitValid) {
      setStep("split");
      return;
    }
    setStep(next);
  };

  const save = async () => {
    setSubmitted(true);
    if (!detailsValid) {
      setStep("details");
      return;
    }
    if (!splitValid || !group) {
      setStep("split");
      return;
    }
    setSaving(true);
    try {
      await createExpense({
        groupId: group.id,
        eventName: eventName.trim(),
        eventDate,
        note: note.trim() || undefined,
        amountMinor,
        paidByMemberId: plan.user.id,
        splitMethod: method,
        shares,
        receiptUri,
      });
      router.replace("/");
      toast.success("Expense saved", `${eventName.trim()} · ${formatMoney(amountMinor, group.currency)} split with ${participants.length} ${participants.length === 1 ? "person" : "people"}.`);
    } catch (error) {
      toast.error("Couldn't save the expense", errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (!plan.groups.length) {
    return (
      <Screen>
        <PageHeader title="Add expense" subtitle="Three short steps, one clear split" />
        {planState === "loading" ? (
          <View style={styles.loading}>
            <Spinner />
            <Text className="text-[13px] font-semibold text-slate">Loading your groups</Text>
          </View>
        ) : (
          <FormNoGroup
            cardWidth={cardWidth}
            title="Group expenses need a group"
            detail="Create a group to split this cost, or track it as an individual entry with one person."
          />
        )}
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader title="Add expense" subtitle="Three short steps, one clear split" />
      <View className="mb-5 gap-3">
        <View className="flex-row items-center justify-between px-1">
          <Text className="text-[11px] font-bold uppercase tracking-[1.2px] text-violet">Step {stepRank[step] + 1} of 3</Text>
          <Text className="text-xs text-slate">You can go back anytime</Text>
        </View>
        <TopTabs tabs={formSteps} value={step} onChange={goToStep} />
      </View>

      <View style={styles.card}>
        <LayeredGroupCard
          variant="compact"
          width={cardWidth}
          height={COMPACT_CARD.HEIGHT}
          skin={groupSkin(group?.accent)}
          art="full"
          glyph="users"
          name={group?.name ?? "Group"}
          currency={group?.currency}
          label="Total"
          amount={formatMoney(amountMinor, group?.currency)}
          chip={{ icon: "file-text", label: eventName.trim() || "New expense", color: CHIP_MUTED }}
          accessibilityLabel={`${group?.name ?? "Group"}. Total ${formatMoney(amountMinor, group?.currency)}. ${eventName.trim() || "New expense"}.`}
        />
      </View>

      {step === "details" ? (
        <View className="gap-4">
          <View className="gap-5 rounded-[24px] border border-line bg-raised p-4 shadow-sm shadow-violet/5">
            <View>
              <Text className="text-lg font-bold text-ink">What was paid?</Text>
              <Text className="mt-1 text-xs leading-5 text-slate">Start with the essentials. Everything else comes next.</Text>
            </View>
            <Field label="Group" required>
              <TopTabs
                tabs={plan.groups.map((item) => ({ key: item.id, label: item.name }))}
                value={groupId}
                onChange={(value) => {
                  setGroupId(value);
                  const next = plan.groups.find((item) => item.id === value);
                  setSelectedIds(next?.members.map((member) => member.id) ?? []);
                }}
              />
            </Field>
            <Field label="Receipt" hint="Optional. We read it on your device and you review every suggestion.">
              {receiptUri ? <Image source={{ uri: receiptUri }} className="h-40 w-full rounded-[18px] bg-surface" resizeMode="cover" /> : null}
              <View className="mt-1 flex-row gap-2">
                <Button label={receiptUri ? "Replace" : "Choose photo"} icon="image" variant="secondary" loading={scanning} onPress={chooseReceipt} />
                {receiptUri ? <Button label="Scan again" icon="maximize" variant="ghost" loading={scanning} onPress={() => void scan(receiptUri)} /> : null}
              </View>
            </Field>
            <Field label="Amount" required error={amountError}>
              <Input value={amount} onChangeText={setAmount} placeholder="6,000" keyboardType="decimal-pad" leadingIcon="credit-card" invalid={Boolean(amountError)} />
            </Field>
            <Field label="Event name" required error={eventError}>
              <Input value={eventName} onChangeText={setEventName} placeholder="Dinner at Monal" trailingIcon={listeningField === "event" ? "square" : "mic"} onTrailingPress={() => void listen("event")} invalid={Boolean(eventError)} />
            </Field>
            <Field label="Event date" required error={dateError} hint="Shown as day, month name, and year.">
              <Input
                value={Platform.OS === "web" ? eventDate : formatLongDate(eventDate)}
                onChangeText={Platform.OS === "web" ? setEventDate : undefined}
                placeholder="13 September 2026"
                leadingIcon="calendar"
                invalid={Boolean(dateError)}
                datePicker={Platform.OS === "web" ? undefined : {
                  value: validDate ? pickerDate : new Date(),
                  onChange: (value) => setEventDate(dateToIso(value)),
                  title: "Event date",
                }}
              />
            </Field>
          </View>
          <Button label="Continue to split" icon="arrow-right" iconSide="right" size="lg" fullWidth onPress={() => goToStep("split")} />
        </View>
      ) : null}

      {step === "split" ? (
        <View className="gap-4">
          <View className="gap-5 rounded-[24px] border border-line bg-raised p-4 shadow-sm shadow-violet/5">
            <View>
              <Text className="text-lg font-bold text-ink">Who shares it?</Text>
              <Text className="mt-1 text-xs leading-5 text-slate">Choose the people first, then adjust only if the split is not equal.</Text>
            </View>
            <Field label="Split method" required>
              <TopTabs
                tabs={[{ key: "equal", label: "Equal" }, { key: "exact", label: "Value" }, { key: "percentage", label: "%" }]}
                value={method}
                onChange={setMethod}
              />
            </Field>
            <Field label="People" required error={submitted && !participants.length ? "Choose at least one person." : undefined}>
              {group ? (
                <MemberRow
                  group={group}
                  currentUserId={plan.user.id}
                  mode="checkbox"
                  layout="wrap"
                  selectedIds={selectedIds}
                  onToggle={(memberId) => setSelectedIds((current) => current.includes(memberId) ? current.filter((id) => id !== memberId) : [...current, memberId])}
                />
              ) : null}
            </Field>
            {method !== "equal" ? (
              <Field label={method === "exact" ? "Amounts" : "Percentages"} required error={submitted && !validAllocation ? method === "exact" ? "Amounts must equal the total." : "Percentages must equal 100%." : undefined}>
                <View className="gap-3">
                  {participants.map((member) => (
                    <View key={member.id} className="flex-row items-center gap-3">
                      <Avatar name={member.name} uri={member.avatarUrl} size="sm" shape="circle" />
                      <Text className="flex-1 font-bold text-ink" numberOfLines={1}>{member.name}</Text>
                      <View className="w-32">
                        <Input value={allocations[member.id] ?? ""} onChangeText={(value) => setAllocations((current) => ({ ...current, [member.id]: value }))} keyboardType="decimal-pad" placeholder={method === "exact" ? "0" : "0%"} />
                      </View>
                    </View>
                  ))}
                </View>
              </Field>
            ) : null}
            <View className="rounded-2xl border border-line bg-canvas px-4 py-3">
              <Text className="text-sm font-semibold text-ink">{participants.length} {participants.length === 1 ? "person" : "people"} · {method === "equal" ? "Equal split" : method === "exact" ? "Exact values" : "Percentage split"}</Text>
            </View>
          </View>
          <View className="flex-row gap-3">
            <View className="flex-1"><Button label="Back" variant="secondary" size="lg" fullWidth onPress={() => setStep("details")} /></View>
            <View className="flex-[1.5]"><Button label="Review expense" icon="arrow-right" iconSide="right" size="lg" fullWidth onPress={() => goToStep("finish")} /></View>
          </View>
        </View>
      ) : null}

      {step === "finish" ? (
        <View className="gap-4">
          <View className="gap-5 rounded-[24px] border border-line bg-raised p-4 shadow-sm shadow-violet/5">
            <View style={styles.summary}>
              <LedgerList>
                <LedgerRow
                  leading={<EntryTile icon="file-text" tone="violet" ringColor={palette.surface} />}
                  title={eventName.trim() || "New expense"}
                  subtitle={`${formatLongDate(eventDate)} · ${group?.name ?? "Group"}`}
                  note={splitSummary}
                  amount={{ text: formatMoney(amountMinor, group?.currency), tone: "neutral" }}
                  accessibilityLabel={`${eventName.trim() || "New expense"}. ${formatLongDate(eventDate)}, ${group?.name ?? "Group"}. ${formatMoney(amountMinor, group?.currency)}. ${splitSummary}.`}
                />
              </LedgerList>
              <View style={styles.getBack}>
                {getBackMinor > 0 ? (
                  <>
                    <Icon name="arrow-down" size={16} color={colors.mint} />
                    <Text className="flex-1 font-medium text-slate" style={styles.getBackLabel}>You get back {formatMoney(getBackMinor, group?.currency)}</Text>
                  </>
                ) : (
                  <>
                    <Icon name="info" size={16} color={colors.slate} />
                    <Text className="flex-1 font-medium text-slate" style={styles.getBackLabel}>Only you are in this split, so nobody will owe you.</Text>
                  </>
                )}
              </View>
            </View>
            <Field label="Note" hint="Optional and visible to the group.">
              <Input value={note} onChangeText={setNote} placeholder="Add a final detail" multiline trailingIcon={listeningField === "note" ? "square" : "mic"} onTrailingPress={() => void listen("note")} />
            </Field>
          </View>
          <View className="flex-row gap-3">
            <View className="flex-1"><Button label="Back" variant="secondary" size="lg" fullWidth onPress={() => setStep("split")} /></View>
            <View className="flex-[1.5]"><Button label="Save expense" icon="check" fullWidth size="lg" loading={saving} disabled={!group} onPress={save} /></View>
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    marginLeft: COMPACT_CARD.MARGIN_LEFT,
    marginTop: 2,
    marginBottom: 26,
  },
  loading: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 40,
  },
  summary: {
    gap: 10,
  },
  getBack: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 4,
  },
  getBackLabel: {
    fontSize: 13,
    lineHeight: 18,
  },
});
