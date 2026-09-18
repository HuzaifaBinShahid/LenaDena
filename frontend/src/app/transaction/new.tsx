import { useEffect, useRef, useState } from "react";
import { Image, Platform, StyleSheet, useWindowDimensions, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
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
import { findPersonByName, isHistoryPersonId, personNameError } from "@/features/people/people";
import { PersonPicker } from "@/features/people/PersonPicker";
import { usePeopleList, usePeopleSummaries } from "@/features/people/usePeople";
import { usePreferences } from "@/features/preferences/PreferencesProvider";
import { useAppLock } from "@/features/security/AppLockProvider";
import { errorMessage } from "@/lib/api";
import { dateFromIso, dateToIso, formatLongDate, formatMoney, toMinorUnits, todayDate } from "@/lib/format";
import { layout } from "@/theme/layout";
import { makeStyles } from "@/theme/ThemeProvider";
import { colors } from "@/theme/tokens";

type PersonalKind = Extract<TransactionKind, "expense" | "loan">;
type VoiceField = "title" | "note";

/** Screen padding (px-[18px] on each side). */
const SCREEN_GUTTERS = 36;

const DIRECTION_TABS = [
  { key: "outgoing" as const, label: "I owe", icon: "arrow-up" as const, tone: "coral" as const },
  { key: "incoming" as const, label: "Owed to me", icon: "arrow-down" as const, tone: "mint" as const },
];

/**
 * Add an individual balance. `?personId=` opens it for a saved person (from their page), and saving returns there;
 * otherwise saving lands on Activity. A new name is saved to People by the API.
 */
export default function NewPersonalTransactionScreen() {
  const params = useLocalSearchParams<{ personId?: string }>();
  const openedFor = typeof params.personId === "string" && params.personId ? params.personId : undefined;
  const { plan, createPersonalTransaction } = useLedger();
  const { speechLocale } = usePreferences();
  const { runWithoutLocking } = useAppLock();
  const toast = useToast();
  const styles = useStyles();
  const summaries = usePeopleSummaries();
  const people = usePeopleList();
  const { width: windowWidth } = useWindowDimensions();
  const [kind, setKind] = useState<PersonalKind>("expense");
  const [direction, setDirection] = useState<TransactionDirection>("outgoing");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [counterparty, setCounterparty] = useState(() => people.find((person) => person.id === openedFor)?.name ?? "");
  const [eventDate, setEventDate] = useState(todayDate());
  const [note, setNote] = useState("");
  const [receiptUri, setReceiptUri] = useState<string>();
  const [listeningField, setListeningField] = useState<VoiceField | null>(null);
  const [scanning, setScanning] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const speech = useRef<SpeechSession | null>(null);
  const prefilled = useRef(Boolean(counterparty));
  const amountMinor = toMinorUnits(amount);
  const currency = plan.totals[0]?.currency ?? plan.groups[0]?.currency ?? "PKR";
  const pickerDate = dateFromIso(eventDate);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(eventDate) && !Number.isNaN(pickerDate.getTime());
  // A saved person, or a name remembered from earlier entries (not yet saved; linked by name on save).
  const linked = findPersonByName(people, counterparty);
  const personName = linked?.name ?? counterparty.trim();
  const personError = personNameError(counterparty);
  const valid = Boolean(title.trim() && amountMinor > 0 && validDate && !personError);
  const cardWidth = Math.min(windowWidth, layout.contentMax) - SCREEN_GUTTERS - COMPACT_CARD.MARGIN_LEFT;
  const cardName = personName || "Individual balance";
  // The preview card is always dark, so its chip keeps the bright tints in both themes.
  const cardChip = direction === "outgoing"
    ? { icon: "arrow-up" as const, label: "You owe", color: colors.coralBright }
    : { icon: "arrow-down" as const, label: "Owed to you", color: colors.mintBright };

  useEffect(() => () => speech.current?.cancel(), []);

  // Opened for a person before the plan arrived: choose them as soon as they show up.
  useEffect(() => {
    if (prefilled.current || !openedFor) return;
    const person = plan.people.find((item) => item.id === openedFor);
    if (!person) return;
    prefilled.current = true;
    setCounterparty((current) => current || person.name);
  }, [openedFor, plan.people]);

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
    const isNewPerson = !linked;
    try {
      await createPersonalTransaction({
        title: title.trim(),
        eventDate,
        amountMinor,
        currency,
        kind,
        direction,
        counterparty: personName,
        // A saved person links by id; a new name is found or created by the API from `counterparty`.
        ...(linked && !isHistoryPersonId(linked.id) ? { personId: linked.id } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(receiptUri ? { receiptUri } : {}),
      });
      // From a person's page, go back there to see the new entry in their history.
      if (openedFor && router.canGoBack()) router.back();
      else router.replace({ pathname: "/", params: { tab: "activity" } });
      toast.success(
        direction === "outgoing" ? `You owe ${personName}` : `${personName} owes you`,
        `${formatMoney(amountMinor, currency)} for ${title.trim()} is now open in Activity.${isNewPerson ? ` ${personName} is now in your people.` : ""}`,
      );
    } catch (error) {
      toast.error("Couldn't save the entry", errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <PageHeader title="Add individual balance" subtitle="No group or invite needed" />
      <View style={shape.card}>
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
      <View style={shape.sections}>
        <View style={styles.section}>
          <View>
            <Text className="text-[17px] font-bold text-ink">Who is it with?</Text>
            <Text className="mt-1 text-xs leading-5 text-slate">
              {summaries.length ? "Type a name, or pick someone you track." : "Type their name. New names are saved to your people."}
            </Text>
          </View>
          <Field error={submitted && personError ? (counterparty.trim() ? personError : "Add the person for this balance.") : undefined}>
            <PersonPicker
              value={counterparty}
              onChange={setCounterparty}
              summaries={summaries}
              {...(openedFor ? { pinnedId: openedFor } : {})}
              invalid={Boolean(submitted && personError)}
            />
          </Field>
        </View>

        <View style={styles.section}>
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
            <TopTabs tabs={DIRECTION_TABS} value={direction} onChange={setDirection} />
          </Field>
          <Field label="What is it for?" required error={submitted && !title.trim() ? "Add a short title." : undefined}>
            <Input
              value={title}
              onChangeText={setTitle}
              placeholder={kind === "loan" ? "Emergency cash" : "Dinner or tickets"}
              leadingIcon={kind === "loan" ? "cash" : "file-text"}
              trailingIcon="mic"
              listening={listeningField === "title"}
              onTrailingPress={() => void listen("title")}
              invalid={submitted && !title.trim()}
            />
          </Field>
          <Field label={`Amount · ${currency}`} required error={submitted && amountMinor <= 0 ? "Enter an amount greater than zero." : undefined}>
            <Input value={amount} onChangeText={setAmount} placeholder="0" keyboardType="decimal-pad" leadingIcon="credit-card" invalid={submitted && amountMinor <= 0} />
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
            <Input
              value={note}
              onChangeText={setNote}
              placeholder="Add a final detail"
              multiline
              trailingIcon="mic"
              listening={listeningField === "note"}
              onTrailingPress={() => void listen("note")}
            />
          </Field>
        </View>
        <Button label={direction === "outgoing" ? "Track what I owe" : "Track what is owed to me"} icon="check" size="lg" fullWidth loading={saving} onPress={save} />
      </View>
    </Screen>
  );
}

// Form sections are working surfaces: raised on the canvas, a line border in both themes, and a soft violet
// shadow that only light mode can show (dark relies on the border).
const useStyles = makeStyles((c, { isDark }) => ({
  section: {
    gap: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: c.line,
    backgroundColor: c.raised,
    padding: 16,
    shadowColor: c.violet,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: isDark ? 0 : 0.05,
    shadowRadius: 10,
    elevation: 0,
  },
}));

const shape = StyleSheet.create({
  card: {
    marginLeft: COMPACT_CARD.MARGIN_LEFT,
    marginTop: 2,
    marginBottom: 26,
  },
  sections: {
    gap: 16,
  },
});
