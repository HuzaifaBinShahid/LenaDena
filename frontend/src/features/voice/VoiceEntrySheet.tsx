import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { RecordingPresets, requestRecordingPermissionsAsync, useAudioRecorder } from "expo-audio";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { ListeningDots } from "@/components/ui/ListeningDots";
import { Text } from "@/components/ui/Text";
import { TopTabs } from "@/components/ui/TopTabs";
import { useToast } from "@/components/ui/Toast";
import type { Person } from "@/features/ledger/types";
import { isCompleteVoiceDraft, parseVoiceDraft, type VoiceDraft, type VoiceLanguage } from "@/features/voice/grammar";
import { errorMessage, transcribeVoiceAudio } from "@/lib/api";
import { formatLongDate, formatMoney, todayDate } from "@/lib/format";
import { colors } from "@/theme/tokens";

type VoiceEntrySheetProps = {
  visible: boolean;
  onClose: () => void;
  people: readonly Person[];
  currency: string;
  /** The screen owns the ledger mutation; this sheet only gathers and confirms a draft. */
  onSave: (draft: VoiceDraft & Required<Pick<VoiceDraft, "amountMinor" | "direction" | "counterparty" | "title">>) => Promise<void>;
  onEdit: (draft: VoiceDraft) => void;
  saving?: boolean;
  defaultLanguage: VoiceLanguage;
  runWithoutLocking: <T>(task: () => Promise<T>) => Promise<T>;
};

type CaptureState = "ready" | "listening" | "transcribing" | "draft";

/**
 * Records a tiny clip locally, sends it only to the authenticated LenaDena backend, then presents a reviewable
 * personal-balance draft. There is intentionally no direct financial write in the capture path.
 */
export function VoiceEntrySheet({ visible, onClose, people, currency, onSave, onEdit, saving = false, defaultLanguage, runWithoutLocking }: VoiceEntrySheetProps) {
  const toast = useToast();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [state, setState] = useState<CaptureState>("ready");
  const [language, setLanguage] = useState<VoiceLanguage>(defaultLanguage);
  const [draft, setDraft] = useState<VoiceDraft>();

  useEffect(() => {
    if (visible) return;
    if (recorder.isRecording) void recorder.stop();
    setState("ready");
    setDraft(undefined);
  }, [recorder, visible]);

  const vocabularyHint = useMemo(() => people.map((person) => person.name).join(", "), [people]);

  const begin = async () => {
    try {
      const permission = await runWithoutLocking(() => requestRecordingPermissionsAsync());
      if (!permission.granted) {
        toast.warning("Microphone needed", "Allow microphone access to speak a balance entry.");
        return;
      }
      await recorder.prepareToRecordAsync();
      recorder.record();
      setState("listening");
    } catch (error) {
      toast.error("Couldn't start voice entry", errorMessage(error));
    }
  };

  const stopAndReview = async () => {
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error("The recording wasn't available. Please try again.");
      setState("transcribing");
      const transcript = await transcribeVoiceAudio(uri, language);
      const next = parseVoiceDraft(transcript, { people, today: todayDate(), defaultCurrency: currency });
      setDraft(next);
      setState("draft");
    } catch (error) {
      setState("ready");
      toast.error("Couldn't transcribe that", errorMessage(error, "Please try again or type the entry instead."));
    }
  };

  const close = () => {
    if (saving || state === "transcribing") return;
    if (recorder.isRecording) void recorder.stop();
    onClose();
  };

  const edit = () => {
    if (!draft) return;
    onEdit(draft);
    onClose();
  };

  const save = async () => {
    if (!draft || !isCompleteVoiceDraft(draft)) return;
    await onSave(draft);
  };

  const isBusy = state === "transcribing" || saving;
  return (
    <BottomSheet
      visible={visible}
      onClose={close}
      title="Voice entry"
      expandable={state === "draft"}
      header={
        <View className="flex-row items-start gap-3">
          <View className="h-11 w-11 items-center justify-center rounded-2xl bg-violet-soft">
            {state === "listening" || state === "transcribing" ? <ListeningDots color={colors.violet} /> : <Text className="text-lg font-bold text-violet">♪</Text>}
          </View>
          <View className="flex-1">
            <Text accessibilityRole="header" className="text-[22px] font-bold tracking-tight text-ink">
              {state === "draft" ? "Review what you said" : state === "transcribing" ? "Understanding your entry" : state === "listening" ? "Listening…" : "Say an entry"}
            </Text>
            <Text className="mt-1 text-[13px] leading-5 text-slate">
              {state === "draft" ? "Nothing is saved until you confirm it." : "Try: I owe Ali 500 rupees for chai."}
            </Text>
          </View>
        </View>
      }
    >
      <View className="gap-4">
        {state === "ready" ? (
          <>
            <Field label="Voice language">
              <TopTabs tabs={[{ key: "en", label: "English", icon: "mic" }, { key: "ur", label: "Urdu", icon: "mic" }]} value={language} onChange={setLanguage} />
            </Field>
            <Text className="text-xs leading-5 text-slate">Your short recording is sent to Deepgram only to make this draft. It is never saved as a ledger record.</Text>
            <Button label="Start listening" icon="mic" fullWidth size="lg" onPress={() => void begin()} />
          </>
        ) : null}
        {state === "listening" ? (
          <>
            <Text className="text-center text-[15px] font-semibold text-ink">Speak naturally, then stop when you finish.</Text>
            <Text className="text-center text-xs leading-5 text-slate">Hinted names: {vocabularyHint || "none saved yet"}</Text>
            <Button label="Stop and review" icon="check" fullWidth size="lg" onPress={() => void stopAndReview()} />
          </>
        ) : null}
        {state === "transcribing" ? <Text className="py-5 text-center text-[14px] text-slate">Sending the short clip securely and preparing your draft…</Text> : null}
        {state === "draft" && draft ? (
          <>
            <Field label="You said">
              <View className="rounded-2xl border border-line bg-surface px-4 py-3"><Text className="text-[14px] leading-5 text-ink">“{draft.transcript}”</Text></View>
            </Field>
            <View className="gap-2 rounded-2xl border border-line bg-raised p-4">
              <DraftRow label="Type" value={draft.kind === "loan" ? "Loan" : "Expense"} />
              <DraftRow label="Balance" value={draft.direction === "outgoing" ? "You owe" : draft.direction === "incoming" ? "Owed to you" : "Needs your choice"} missing={!draft.direction} />
              <DraftRow label="Person" value={draft.counterparty ?? "Needs a person"} missing={!draft.counterparty} />
              <DraftRow label="Amount" value={draft.amountMinor ? formatMoney(draft.amountMinor, draft.currency) : "Needs an amount"} missing={!draft.amountMinor} />
              <DraftRow label="For" value={draft.title ?? "Needs a title"} missing={!draft.title} />
              <DraftRow label="Date" value={formatLongDate(draft.eventDate)} />
            </View>
            {draft.missing.length ? <Text className="text-xs leading-5 text-coral">Edit the form to complete: {draft.missing.join(", ")}.</Text> : null}
            <Button label="Save balance" icon="check" fullWidth size="lg" loading={saving} disabled={!isCompleteVoiceDraft(draft)} onPress={() => void save()} />
            <Button label="Edit in form" icon="pencil" variant="secondary" fullWidth disabled={isBusy} onPress={edit} />
            <Button label="Try again" variant="ghost" fullWidth disabled={isBusy} onPress={() => { setDraft(undefined); setState("ready"); }} />
          </>
        ) : null}
      </View>
    </BottomSheet>
  );
}

function DraftRow({ label, value, missing = false }: { label: string; value: string; missing?: boolean }) {
  return <View className="flex-row items-center justify-between gap-4"><Text className="text-xs font-semibold text-slate">{label}</Text><Text className={`flex-1 text-right text-[14px] font-bold ${missing ? "text-coral" : "text-ink"}`}>{value}</Text></View>;
}
