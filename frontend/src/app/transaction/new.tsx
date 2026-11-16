import { useEffect, useRef, useState } from "react";
import { Image, Platform, StyleSheet, useWindowDimensions, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { COMPACT_CARD, LayeredGroupCard } from "@/components/groups/LayeredGroupCard";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { ConfirmDelete } from "@/components/ledger/ConfirmDelete";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Screen } from "@/components/ui/Screen";
import { Spinner } from "@/components/ui/Spinner";
import { Text } from "@/components/ui/Text";
import { TopTabs } from "@/components/ui/TopTabs";
import { useToast } from "@/components/ui/Toast";
import { recognizeReceipt } from "@/features/capture/ocr";
import { speechUnavailableMessage, startOnDeviceSpeech, type SpeechSession } from "@/features/capture/speech";
import { groupSkin } from "@/features/groups/groupSkin";
import { deleteEntryWarning, personalAmountError, personalLocks, minorToInput, receiptChange, receiptDraft, shownReceipt, withNewReceipt, withoutReceipt, type ReceiptDraft } from "@/features/ledger/editRules";
import { useLedger } from "@/features/ledger/LedgerProvider";
import { getPlanState } from "@/features/ledger/planState";
import type { TransactionDirection, TransactionKind } from "@/features/ledger/types";
import { findPersonByName, isHistoryPersonId, personNameError } from "@/features/people/people";
import { PersonPicker } from "@/features/people/PersonPicker";
import { usePeopleList, usePeopleSummaries } from "@/features/people/usePeople";
import { usePreferences } from "@/features/preferences/PreferencesProvider";
import { useAppLock } from "@/features/security/AppLockProvider";
import { VoiceEntrySheet } from "@/features/voice/VoiceEntrySheet";
import { VOICE_ENABLED } from "@/lib/features";
import type { VoiceDraft } from "@/features/voice/grammar";
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
 * Add an individual balance. `?personId=` only preselects someone from their page; every successful save returns
 * to the home Plan tab. A new name is saved to People by the API.
 *
 * `?id=` edits an existing balance instead: the same form, filled in, with Delete at the bottom. Once a payment is
 * recorded the amount must stay above what has been paid and who owes whom (and the currency) are locked; a fully
 * paid balance keeps its amount (features/ledger/editRules.ts).
 */
export default function NewPersonalTransactionScreen() {
  const params = useLocalSearchParams<{ personId?: string; voice?: string; id?: string }>();
  const openedFor = typeof params.personId === "string" && params.personId ? params.personId : undefined;
  const editingId = typeof params.id === "string" && params.id ? params.id : undefined;
  const { plan, connection, createPersonalTransaction, updatePersonalTransaction, deletePersonalTransaction } = useLedger();
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
  const [receipt, setReceipt] = useState<ReceiptDraft>(receiptDraft());
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [listeningField, setListeningField] = useState<VoiceField | null>(null);
  const [scanning, setScanning] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [voiceVisible, setVoiceVisible] = useState(false);
  const speech = useRef<SpeechSession | null>(null);
  const prefilled = useRef(Boolean(counterparty));
  const filledFor = useRef<string | undefined>(undefined);
  const openedVoice = useRef(false);
  const amountMinor = toMinorUnits(amount);
  const entry = editingId ? plan.transactions.find((item) => item.id === editingId && item.source === "personal") : undefined;
  const locks = entry ? personalLocks(entry) : undefined;
  const currency = entry?.currency ?? plan.totals[0]?.currency ?? plan.groups[0]?.currency ?? "PKR";
  const amountError = locks ? personalAmountError(amountMinor, locks, currency) : amountMinor <= 0 ? "Enter an amount greater than zero." : undefined;
  const shownPhoto = shownReceipt(receipt);
  const pickerDate = dateFromIso(eventDate);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(eventDate) && !Number.isNaN(pickerDate.getTime());
  // A saved person, or a name remembered from earlier entries (not yet saved; linked by name on save).
  const linked = findPersonByName(people, counterparty);
  const personName = linked?.name ?? counterparty.trim();
  const personError = personNameError(counterparty);
  const valid = Boolean(title.trim() && !amountError && validDate && !personError);
  const cardWidth = Math.min(windowWidth, layout.contentMax) - SCREEN_GUTTERS - COMPACT_CARD.MARGIN_LEFT;
  const cardName = personName || "Individual balance";
  // The preview card is always dark, so its chip keeps the bright tints in both themes.
  const cardChip = direction === "outgoing"
    ? { icon: "arrow-up" as const, label: "You owe", color: colors.coralBright }
    : { icon: "arrow-down" as const, label: "Owed to you", color: colors.mintBright };

  useEffect(() => () => speech.current?.cancel(), []);

  // Editing: fill the form from the balance once it is in the plan (the plan may still be loading when this opens).
  useEffect(() => {
    if (!entry || filledFor.current === entry.id) return;
    filledFor.current = entry.id;
    prefilled.current = true;
    setKind(entry.kind === "loan" ? "loan" : "expense");
    setDirection(entry.direction);
    setTitle(entry.title);
    setAmount(minorToInput(entry.amountMinor));
    setCounterparty(entry.counterparty ?? "");
    setEventDate(entry.eventDate);
    setNote(entry.note ?? "");
    setReceipt(receiptDraft(entry.receiptUri));
  }, [entry]);

  useEffect(() => {
    if (!VOICE_ENABLED || openedVoice.current || params.voice !== "1") return;
    openedVoice.current = true;
    setVoiceVisible(true);
  }, [params.voice]);

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
      setReceipt((current) => withNewReceipt(current, uri));
      await scanReceipt(uri);
    }
  };

  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/"));

  const saveChanges = async () => {
    setSubmitted(true);
    if (!valid || !entry) return;
    setSaving(true);
    const photo = receiptChange(receipt);
    try {
      await updatePersonalTransaction(entry.id, {
        title: title.trim(),
        eventDate,
        amountMinor,
        currency,
        kind,
        direction,
        counterparty: personName,
        ...(linked && !isHistoryPersonId(linked.id) ? { personId: linked.id } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(photo !== undefined ? { receiptUri: photo } : {}),
      });
      goBack();
      toast.success("Balance updated", `${title.trim()} · ${formatMoney(amountMinor, currency)} with ${personName}.`);
    } catch (error) {
      toast.error("Couldn't save the changes", errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const removeEntry = async () => {
    if (!entry) return;
    setDeleting(true);
    try {
      await deletePersonalTransaction(entry.id);
      goBack();
      toast.success("Balance deleted", `${entry.title} is no longer on your balances.`);
    } catch (error) {
      setConfirmingDelete(false);
      toast.error("Couldn't delete it", errorMessage(error));
    } finally {
      setDeleting(false);
    }
  };

  const save = async () => {
    if (editingId) {
      await saveChanges();
      return;
    }
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
        ...(receipt.local ? { receiptUri: receipt.local } : {}),
      });
      router.replace("/");
      toast.success(
        direction === "outgoing" ? `You owe ${personName}` : `${personName} owes you`,
        `${formatMoney(amountMinor, currency)} for ${title.trim()} is now open on your home balance.${isNewPerson ? ` ${personName} is now in your people.` : ""}`,
      );
    } catch (error) {
      toast.error("Couldn't save the entry", errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const applyVoiceDraft = (draft: VoiceDraft) => {
    setKind(draft.kind);
    if (draft.direction) setDirection(draft.direction);
    if (draft.counterparty) setCounterparty(draft.counterparty);
    if (draft.amountMinor) setAmount(String(draft.amountMinor / 100));
    if (draft.title) setTitle(draft.title);
    setEventDate(draft.eventDate);
    toast.info("Voice details filled", "Review or change anything, then save the balance.");
  };

  const saveVoiceDraft = async (draft: VoiceDraft & Required<Pick<VoiceDraft, "amountMinor" | "direction" | "counterparty" | "title">>) => {
    const voiceLinked = findPersonByName(people, draft.counterparty);
    const voicePerson = voiceLinked?.name ?? draft.counterparty.trim();
    const isNewPerson = !voiceLinked;
    setSaving(true);
    try {
      await createPersonalTransaction({
        title: draft.title.trim(),
        eventDate: draft.eventDate,
        amountMinor: draft.amountMinor,
        currency: draft.currency,
        kind: draft.kind,
        direction: draft.direction,
        counterparty: voicePerson,
        ...(voiceLinked && !isHistoryPersonId(voiceLinked.id) ? { personId: voiceLinked.id } : {}),
      });
      router.replace("/");
      toast.success(
        draft.direction === "outgoing" ? `You owe ${voicePerson}` : `${voicePerson} owes you`,
        `${formatMoney(draft.amountMinor, draft.currency)} for ${draft.title.trim()} is now open on your home balance.${isNewPerson ? ` ${voicePerson} is now in your people.` : ""}`,
      );
    } catch (error) {
      toast.error("Couldn't save the entry", errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (editingId && !entry) {
    const loading = getPlanState(plan, connection) === "loading";
    return (
      <Screen>
        <PageHeader title="Edit balance" subtitle="Change the details, or delete it" />
        {loading ? (
          <View style={shape.centered}>
            <Spinner />
            <Text className="text-[13px] font-semibold text-slate">Loading this balance</Text>
          </View>
        ) : (
          <EmptyState icon="alert-circle" title="This balance isn't available" detail="It may have been deleted, or it belongs to another account." action={{ label: "Go back", onPress: goBack }} />
        )}
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader title={editingId ? "Edit balance" : "Add individual balance"} subtitle={editingId ? "Change the details, or delete it" : "No group or invite needed"} />
      {VOICE_ENABLED && !editingId ? (
        <View className="mb-4">
          <Button label="Fill by voice" icon="mic" variant="secondary" fullWidth onPress={() => setVoiceVisible(true)} />
        </View>
      ) : null}
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
            <Text className="mt-1 text-xs leading-5 text-slate">{editingId ? "Change anything that was wrong." : "This starts open. Mark it settled later from Activity."}</Text>
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
          {locks?.sideLocked ? (
            <Field label="Balance" hint="Locked because a payment is recorded on it.">
              <Text className="text-[15px] font-bold text-ink">{direction === "outgoing" ? "I owe" : "Owed to me"} · {currency}</Text>
            </Field>
          ) : (
            <Field label="Balance" required>
              <TopTabs tabs={DIRECTION_TABS} value={direction} onChange={setDirection} />
            </Field>
          )}
          <Field label="What is it for?" required error={submitted && !title.trim() ? "Add a short title." : undefined}>
            <Input
              value={title}
              onChangeText={setTitle}
              placeholder={kind === "loan" ? "Emergency cash" : "Dinner or tickets"}
              leadingIcon={kind === "loan" ? "cash" : "file-text"}
              {...(VOICE_ENABLED ? { trailingIcon: "mic" as const, listening: listeningField === "title", onTrailingPress: () => void listen("title") } : {})}
              invalid={submitted && !title.trim()}
            />
          </Field>
          <Field
            label={`Amount · ${currency}`}
            required
            error={submitted ? amountError : undefined}
            {...(locks?.amountLocked ? { hint: "Fully paid, so the amount can't change." } : locks?.paidMinor ? { hint: `${formatMoney(locks.paidMinor, currency)} is already paid. The amount must be higher.` } : {})}
          >
            <Input value={amount} onChangeText={setAmount} placeholder="0" keyboardType="decimal-pad" leadingIcon="credit-card" editable={!locks?.amountLocked} invalid={Boolean(submitted && amountError)} />
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
            {shownPhoto ? <Image source={{ uri: shownPhoto }} className="h-40 w-full rounded-[18px] bg-surface" resizeMode="cover" /> : null}
            <View className="mt-1 flex-row flex-wrap gap-2">
              <Button label={shownPhoto ? "Replace" : "Choose photo"} icon="image" variant="secondary" loading={scanning} onPress={chooseReceipt} />
              {receipt.local ? <Button label="Scan again" icon="maximize" variant="ghost" loading={scanning} onPress={() => void scanReceipt(receipt.local!)} /> : null}
              {editingId && shownPhoto ? <Button label="Remove" icon="trash-2" variant="ghost" onPress={() => setReceipt((current) => withoutReceipt(current))} /> : null}
            </View>
          </Field>
          <Field label="Note" hint="Optional and only visible to you.">
            <Input
              value={note}
              onChangeText={setNote}
              placeholder="Add a final detail"
              multiline
              {...(VOICE_ENABLED ? { trailingIcon: "mic" as const, listening: listeningField === "note", onTrailingPress: () => void listen("note") } : {})}
            />
          </Field>
        </View>
        <Button
          label={editingId ? "Save changes" : direction === "outgoing" ? "Track what I owe" : "Track what is owed to me"}
          icon="check"
          size="lg"
          fullWidth
          loading={saving}
          disabled={deleting}
          onPress={save}
        />
        {entry ? (
          confirmingDelete ? (
            <ConfirmDelete
              title="Delete this balance?"
              message={deleteEntryWarning(entry)}
              confirmLabel="Delete balance"
              busy={deleting}
              onConfirm={() => void removeEntry()}
              onCancel={() => setConfirmingDelete(false)}
            />
          ) : (
            <Button label="Delete balance" icon="trash-2" variant="danger" size="lg" fullWidth disabled={saving} onPress={() => setConfirmingDelete(true)} />
          )
        ) : null}
      </View>
      {VOICE_ENABLED ? (
        <VoiceEntrySheet
          visible={voiceVisible}
          onClose={() => setVoiceVisible(false)}
          people={people}
          currency={currency}
          defaultLanguage={speechLocale.toLowerCase().startsWith("ur") ? "ur" : "en"}
          runWithoutLocking={runWithoutLocking}
          saving={saving}
          onEdit={applyVoiceDraft}
          onSave={saveVoiceDraft}
        />
      ) : null}
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
  centered: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 40,
  },
});
