import { useState } from "react";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/Toast";
import { useLedger } from "@/features/ledger/LedgerProvider";
import { personFirstName } from "@/features/people/people";
import { errorMessage } from "@/lib/api";
import { formatMoney } from "@/lib/format";

/**
 * The "Email Ali about this?" question. LenaDena emails a person on its own when they already have something open
 * with you; when they had nothing open (a new contact, or an old one all settled) the API holds back and asks, because
 * a first email to someone is the owner's call. Lives at the app root so every way of adding an entry gets it.
 */
export function EntryEmailPromptHost() {
  const { entryEmailPrompt: prompt, dismissEntryEmailPrompt, emailPerson } = useLedger();
  const toast = useToast();
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!prompt || sending) return;
    setSending(true);
    try {
      await emailPerson(prompt.personId, "entry", prompt.transactionId);
      toast.success(`Email on its way to ${personFirstName(prompt.personName)}`, `${prompt.email} will get this entry and where things stand.`);
    } catch (error) {
      toast.error(`Couldn't email ${personFirstName(prompt.personName)}`, errorMessage(error));
    } finally {
      setSending(false);
      dismissEntryEmailPrompt();
    }
  };

  const first = prompt ? personFirstName(prompt.personName) : "them";
  const owes = prompt?.direction === "incoming" ? `${first} owes you` : `You owe ${first}`;

  return (
    <ConfirmModal
      visible={Boolean(prompt)}
      icon="mail"
      title={`Email ${first} about this?`}
      detail={prompt
        ? `${owes} ${formatMoney(prompt.amountMinor, prompt.currency)} for ${prompt.title}. LenaDena can email ${prompt.email} the entry so you both see the same figures.`
        : ""}
      confirmLabel="Send email"
      cancelLabel="Not now"
      loading={sending}
      onConfirm={() => void send()}
      onClose={dismissEntryEmailPrompt}
    />
  );
}
