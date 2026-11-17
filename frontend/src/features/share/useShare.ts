import { useCallback, useRef, useState } from "react";
import { Share } from "react-native";
import { useToast } from "@/components/ui/Toast";
import { useLedger } from "@/features/ledger/LedgerProvider";
import type { Person, TransactionItem } from "@/features/ledger/types";
import { useAppLock } from "@/features/security/AppLockProvider";
import { errorMessage } from "@/lib/api";
import { reminderShareMessage } from "@/features/push/pushRules";
import { buildEntryShareMessage, buildStatementShareMessage, entryShareTitle, statementShareTitle } from "./message";

/**
 * Opens the system share sheet with a ready-made message for one entry or a whole account with a person, so it
 * goes to WhatsApp, email, SMS or any app the way the person picks. The sheet backgrounds the app, so it runs inside
 * `runWithoutLocking`. `sharing` is the key of the share in flight ("entry:<id>" or "statement:<person id>"); a press
 * while one is open is ignored.
 */
export function useShare() {
  const { plan } = useLedger();
  const { runWithoutLocking } = useAppLock();
  const toast = useToast();
  const [sharing, setSharing] = useState<string | null>(null);
  const busy = useRef(false);
  const ownerName = plan.user.name;

  const open = useCallback(async (key: string, title: string, message: string, dialogTitle: string) => {
    if (busy.current) return;
    busy.current = true;
    setSharing(key);
    try {
      await runWithoutLocking(() => Share.share({ title, message }, { subject: title, dialogTitle }));
    } catch (error) {
      // Closing the sheet is not a failure (the web share sheet reports it as an AbortError).
      if (!(error instanceof Error && error.name === "AbortError")) toast.error("Couldn't open sharing", errorMessage(error));
    } finally {
      busy.current = false;
      setSharing(null);
    }
  }, [runWithoutLocking, toast]);

  const shareEntry = useCallback(
    (entry: TransactionItem, personName?: string) =>
      open(`entry:${entry.id}`, entryShareTitle({ entry, personName }), buildEntryShareMessage({ entry, personName }), "Share entry"),
    [open],
  );

  const shareStatement = useCallback(
    (person: Pick<Person, "id" | "name"> & Partial<Person>, entries: readonly TransactionItem[]) =>
      open(`statement:${person.id}`, statementShareTitle({ person }), buildStatementShareMessage({ person, entries, ownerName }), "Share statement"),
    [open, ownerName],
  );

  /** The words of a reminder, through the share sheet: for someone who gets no notifications, or when one can't be sent. */
  const shareReminder = useCallback(
    (input: { memberId: string; memberName: string; amountMinor: number; currency: string; groupName: string }) =>
      open(`reminder:${input.memberId}`, `Reminder · ${input.groupName}`, reminderShareMessage(input), "Send a reminder"),
    [open],
  );

  return { shareEntry, shareStatement, shareReminder, sharing };
}
