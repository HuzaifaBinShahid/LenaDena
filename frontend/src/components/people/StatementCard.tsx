import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { InviteCard, InviteRow } from "@/components/people/InviteCard";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useLedger } from "@/features/ledger/LedgerProvider";
import type { Person, ReminderFrequency, TransactionItem } from "@/features/ledger/types";
import { reminderDetail } from "@/features/people/emailSettings";
import { isHistoryPersonId, personFirstName } from "@/features/people/people";
import { useShare } from "@/features/share/useShare";
import { errorMessage } from "@/lib/api";

const CHOICES: ReadonlyArray<{ value: ReminderFrequency; label: string }> = [
  { value: "off", label: "Off" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

/**
 * Everything about sending one person their account: share it from any app, email the complete statement with a PDF
 * when you tap Send, and optionally choose weekly or monthly reminders. LenaDena sends nothing else on its own:
 * not when you add an entry and not when you add their address. Names remembered only from past entries can share
 * but not email.
 */
export function StatementCard({ person, entries }: { person: Person; entries: readonly TransactionItem[] }) {
  const { emailPerson, updatePerson } = useLedger();
  const { shareStatement, sharing } = useShare();
  const toast = useToast();
  const [sentKey, setSentKey] = useState<string | null>(null);
  const [emailing, setEmailing] = useState(false);
  const [saving, setSaving] = useState(false);
  const first = personFirstName(person.name);
  const remembered = isHistoryPersonId(person.id);
  const address = person.email?.trim();
  const hasEntries = entries.length > 0;
  const frequency: ReminderFrequency = person.reminderFrequency ?? "off";
  const key = `${person.id}:${address ?? ""}`;
  const sent = sentKey === key;

  const sendStatement = async () => {
    if (emailing) return;
    setEmailing(true);
    try {
      await emailPerson(person.id);
      setSentKey(key);
      toast.success(`Statement on its way to ${first}`, `${address ?? "They"} will get every entry with a PDF attached.`);
    } catch (error) {
      toast.error(`Couldn't email ${first}`, errorMessage(error));
    } finally {
      setEmailing(false);
    }
  };

  const saveReminders = async (reminderFrequency: ReminderFrequency, done: string) => {
    if (saving) return;
    setSaving(true);
    try {
      await updatePerson(person.id, { reminderFrequency });
      toast.success(done, `${first}'s settings are saved.`);
    } catch (error) {
      toast.error("Couldn't save that", errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={shape.section}>
      <InviteCard
        title={`Send ${first} their account`}
        footnote={remembered ? `To email ${first}, save them with their email first.` : undefined}
      >
        <InviteRow
          key="share"
          icon="share"
          title="Share their statement"
          detail={hasEntries ? "Every entry in a ready-to-send message for WhatsApp, email or any app." : "Add an entry first, then share it from here."}
          trailing={(
            <Button
              label="Share"
              size="sm"
              variant="secondary"
              loading={sharing === `statement:${person.id}`}
              disabled={!hasEntries}
              accessibilityHint={`Opens the share sheet with ${first}'s statement`}
              onPress={() => void shareStatement(person, entries)}
            />
          )}
        />
        {remembered ? null : (
          <InviteRow
            key="email"
            icon="file-text"
            muted={!address || !hasEntries}
            title="Email the statement"
            detail={!address
              ? "Add their email in Edit to send it."
              : !hasEntries
                ? "Add an entry first, then email it from here."
                : sent
                  ? `Sent to ${address}. You can send another in 5 minutes.`
                  : `The complete account as a designed email with a PDF attached, to ${address}.`}
            trailing={(
              <Button
                label={sent ? "Sent" : "Send"}
                {...(sent ? { icon: "check" as const } : {})}
                size="sm"
                variant={sent ? "secondary" : "primary"}
                loading={emailing}
                disabled={!address || !hasEntries || sent}
                accessibilityHint={address ? `Emails ${first} the full statement with a PDF` : "Add their email first"}
                onPress={() => void sendStatement()}
              />
            )}
          />
        )}
        {remembered ? null : (
          <InviteRow
            key="reminders"
            icon="clock"
            muted={!address}
            title="Reminders"
            detail={reminderDetail(first, frequency, address)}
            trailing={null}
            footer={(
              <View style={shape.choices} accessibilityRole="radiogroup" accessibilityLabel={`How often to remind ${first}`}>
                {CHOICES.map((choice) => (
                  <View key={choice.value} style={shape.choice}>
                    <Button
                      label={choice.label}
                      size="sm"
                      fullWidth
                      variant={frequency === choice.value ? "primary" : "secondary"}
                      selected={frequency === choice.value}
                      disabled={!address || saving}
                      accessibilityHint={`Reminds ${first} ${choice.value === "off" ? "never" : choice.value}`}
                      onPress={() => {
                        if (choice.value !== frequency) void saveReminders(choice.value, choice.value === "off" ? "Reminders off" : `${choice.label} reminders on`);
                      }}
                    />
                  </View>
                ))}
              </View>
            )}
          />
        )}
      </InviteCard>
    </View>
  );
}

const shape = StyleSheet.create({
  section: {
    marginTop: 16,
  },
  choices: {
    flexDirection: "row",
    gap: 8,
  },
  choice: {
    flex: 1,
  },
});
