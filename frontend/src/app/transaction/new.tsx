import { useEffect, useRef, useState } from "react";
import { Image, Platform, StyleSheet, useWindowDimensions, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { COMPACT_CARD, LayeredGroupCard } from "@/components/groups/LayeredGroupCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { TopTabs } from "@/components/ui/TopTabs";
import { useToast } from "@/components/ui/Toast";
import { recognizeReceipt } from "@/features/capture/ocr";
import { speechUnavailableMessage, startOnDeviceSpeech, type SpeechSession } from "@/features/capture/speech";
import { groupSkin } from "@/features/groups/groupSkin";
import { useLedger } from "@/features/ledger/LedgerProvider";
import type { TransactionDirection, TransactionKind } from "@/features/ledger/types";
import { usePreferences } from "@/features/preferences/PreferencesProvider";
import { useAppLock } from "@/features/security/AppLockProvider";
import { errorMessage } from "@/lib/api";
import { dateFromIso, dateToIso, formatLongDate, formatMoney, toMinorUnits, todayDate } from "@/lib/format";
import { layout } from "@/theme/layout";
import { colors } from "@/theme/tokens";

type PersonalKind = Extract<TransactionKind, "expense" | "loan">;
type VoiceField = "title" | "note";

/** Screen padding (px-[18px] on each side). */
const SCREEN_GUTTERS = 36;

export default function NewPersonalTransactionScreen() {
  const { plan, createPersonalTransaction } = useLedger();
  const { speechLocale } = usePreferences();
  const { runWithoutLocking } = useAppLock();
  const toast = useToast();
  const { width: windowWidth } = useWindowDimensions();
  const [kind, setKind] = useState<PersonalKind>("expense");
  const [direction, setDirection] = useState<TransactionDirection>("outgoing");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [eventDate, setEventDate] = useState(todayDate());
  const [note, setNote] = useState("");
  const [receiptUri, setReceiptUri] = useState<string>();
  const [listeningField, setListeningField] = useState<VoiceField | null>(null);
  const [scanning, setScanning] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const speech = useRef<SpeechSession | null>(null);
  const amountMinor = toMinorUnits(amount);
  const currency = plan.totals[0]?.currency ?? plan.groups[0]?.currency ?? "PKR";
  const pickerDate = dateFromIso(eventDate);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(eventDate) && !Number.isNaN(pickerDate.getTime());
  const valid = Boolean(title.trim() && amountMinor > 0 && validDate && counterparty.trim());
  const cardWidth = Math.min(windowWidth, layout.contentMax) - SCREEN_GUTTERS - COMPACT_CARD.MARGIN_LEFT;
  const cardName = counterparty.trim() || "Individual balance";
  const cardChip = direction === "outgoing"
    ? { icon: "arrow-up" as const, label: "You owe", color: colors.coralBright }
    : { icon: "arrow-down" as const, label: "Owed to you", color: colors.mintBright };

  useEffect(() => () => speech.current?.cancel(), []);

  const listen = async (field: VoiceField) => {
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
      (value) => field === "title" ? setTitle(value) : setNote(value),
      () => setListeningField(null),
      (message) => {
        reportedError = true;
        setListeningField(null);
        toast.warning("Voice input stopped", message);
      },
    ));
    if (!session) {
      setListeningField(null);
      if (!reportedError) toast.info("On-device voice unavailable", "Use the keyboard, or a development build with a downloaded speech model.");
    }
    speech.current = session;
  };

  const scanReceipt = async (uri: string) => {
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
    if (suggestedName) setTitle(suggestedName);
    if (suggestedAmount || date || suggestedName) toast.success("Receipt scanned", "Check the suggested details before saving.");
    else toast.info("Couldn't read this receipt", "It's attached. Enter the details yourself.");
  };

  const chooseReceipt = async () => {
    const result = await runWithoutLocking(() => ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, allowsEditing: true }));
    if (!result.canceled && result.assets[0]?.uri) {
      const uri = result.assets[0].uri;
      setReceiptUri(uri);
      await scanReceipt(uri);
    }
  };

  const save = async () => {
    setSubmitted(true);
    if (!valid) return;
    setSaving(true);
    try {
      await createPersonalTransaction({
        title: title.trim(),
        eventDate,
        amountMinor,
        currency,
        kind,
        direction,
        counterparty: counterparty.trim(),
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(receiptUri ? { receiptUri } : {}),
      });
      router.replace({ pathname: "/", params: { tab: "activity" } });
      toast.success(
        direction === "outgoing" ? `You owe ${counterparty.trim()}` : `${counterparty.trim()} owes you`,
        `${formatMoney(amountMinor, currency)} for ${title.trim()} is now open in Activity.`,
      );
    } catch (error) {
      toast.error("Couldn't save the entry", errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const directionTabs = kind === "loan"
    ? [
      { key: "outgoing" as const, label: "I owe", icon: "arrow-up" as const },
      { key: "incoming" as const, label: "Owed to me", icon: "arrow-down" as const },
    ]
    : [
      { key: "outgoing" as const, label: "I owe", icon: "arrow-up" as const },
      { key: "incoming" as const, label: "Owed to me", icon: "arrow-down" as const },
    ];

  return (
    <Screen>
      <PageHeader title="Add individual balance" subtitle="No group or invite needed" />
      <View style={styles.card}>
        <LayeredGroupCard
          variant="compact"
          width={cardWidth}
          height={COMPACT_CARD.HEIGHT}
          skin={groupSkin()}
          art="full"
          glyph="user"
          name={cardName}
          currency={currency}
          label="Amount"
          amount={formatMoney(amountMinor, currency)}
          chip={cardChip}
          accessibilityLabel={`${cardName}. ${cardChip.label} ${formatMoney(amountMinor, currency)}.`}
        />
      </View>
      <View className="gap-4">
        <View className="gap-5 rounded-[24px] border border-line bg-raised p-4 shadow-sm shadow-violet/5">
          <View>
            <Text className="text-[17px] font-bold text-ink">What needs settling?</Text>
            <Text className="mt-1 text-xs leading-5 text-slate">This starts open. Mark it settled later from Activity.</Text>
          </View>
          <Field label="Type" required>
            <TopTabs
              tabs={[
                { key: "expense", label: "Expense", icon: "file-text" },
                { key: "loan", label: "Loan", icon: "cash" },
              ]}
              value={kind}
              onChange={setKind}
            />
          </Field>
          <Field label="Balance" required>
            <TopTabs tabs={directionTabs} value={direction} onChange={setDirection} />
          </Field>
          <Field label="What is it for?" required error={submitted && !title.trim() ? "Add a short title." : undefined}>
            <Input
              value={title}
              onChangeText={setTitle}
              placeholder={kind === "loan" ? "Emergency cash" : "Dinner or tickets"}
              leadingIcon={kind === "loan" ? "cash" : "file-text"}
              trailingIcon={listeningField === "title" ? "square" : "mic"}
              onTrailingPress={() => void listen("title")}
              invalid={submitted && !title.trim()}
            />
          </Field>
          <Field label={`Amount · ${currency}`} required error={submitted && amountMinor <= 0 ? "Enter an amount greater than zero." : undefined}>
            <Input value={amount} onChangeText={setAmount} placeholder="0" keyboardType="decimal-pad" leadingIcon="credit-card" invalid={submitted && amountMinor <= 0} />
          </Field>
          <Field
            label={direction === "outgoing" ? "Owed to" : "Owed by"}
            required
            error={submitted && !counterparty.trim() ? "Add the person for this balance." : undefined}
          >
            <Input value={counterparty} onChangeText={setCounterparty} placeholder="Person's name" leadingIcon="user" invalid={submitted && !counterparty.trim()} />
          </Field>
          <Field label="Due date" required error={submitted && !validDate ? "Choose a valid date." : undefined}>
            <Input
              value={Platform.OS === "web" ? eventDate : formatLongDate(eventDate)}
              onChangeText={Platform.OS === "web" ? setEventDate : undefined}
              placeholder="13 September 2026"
              leadingIcon="calendar"
              invalid={submitted && !validDate}
              datePicker={Platform.OS === "web" ? undefined : {
                value: validDate ? pickerDate : new Date(),
                onChange: (value) => setEventDate(dateToIso(value)),
                title: "Due date",
              }}
            />
          </Field>
          <Field label="Receipt" hint="Optional. We read it on your device and you review every suggestion.">
            {receiptUri ? <Image source={{ uri: receiptUri }} className="h-40 w-full rounded-[18px] bg-surface" resizeMode="cover" /> : null}
            <View className="mt-1 flex-row gap-2">
              <Button label={receiptUri ? "Replace" : "Choose photo"} icon="image" variant="secondary" loading={scanning} onPress={chooseReceipt} />
              {receiptUri ? <Button label="Scan again" icon="maximize" variant="ghost" loading={scanning} onPress={() => void scanReceipt(receiptUri)} /> : null}
            </View>
          </Field>
          <Field label="Note" hint="Optional and only visible to you.">
            <Input value={note} onChangeText={setNote} placeholder="Add a final detail" multiline trailingIcon={listeningField === "note" ? "square" : "mic"} onTrailingPress={() => void listen("note")} />
          </Field>
        </View>
        <Button label={direction === "outgoing" ? "Track what I owe" : "Track what is owed to me"} icon="check" size="lg" fullWidth loading={saving} onPress={save} />
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
});
