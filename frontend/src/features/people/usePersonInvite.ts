import { useCallback, useRef, useState } from "react";
import { Share } from "react-native";
import { useToast } from "@/components/ui/Toast";
import { useLedger } from "@/features/ledger/LedgerProvider";
import { APP_DOWNLOAD_URL, buildInviteMessage, inviteShareTitle } from "@/features/people/invite";
import { personFirstName } from "@/features/people/people";
import { useAppLock } from "@/features/security/AppLockProvider";
import { errorMessage } from "@/lib/api";

type InviteTarget = { id: string; name: string; email?: string | undefined };

/**
 * The two ways to invite someone from People:
 * - `share(name)` opens the system share sheet with a ready-made message (works for anyone, saved or not). The
 *   sheet backgrounds the app, so it runs inside `runWithoutLocking`.
 * - `email(person)` asks the API to email a saved person with an address, and toasts the outcome. It resolves to
 *   whether the invite was queued. Presses while one is in flight are ignored.
 */
export function usePersonInvite() {
  const { plan, invitePerson } = useLedger();
  const { runWithoutLocking } = useAppLock();
  const toast = useToast();
  const [emailing, setEmailing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const busy = useRef(false);
  const inviterName = plan.user.name;

  const share = useCallback(async (personName: string) => {
    if (busy.current) return;
    busy.current = true;
    setSharing(true);
    const title = inviteShareTitle(inviterName);
    try {
      await runWithoutLocking(() => Share.share(
        { title, message: buildInviteMessage({ personName, inviterName, downloadUrl: APP_DOWNLOAD_URL }) },
        { subject: title, dialogTitle: "Share invite" },
      ));
    } catch (error) {
      toast.error("Couldn't open sharing", errorMessage(error));
    } finally {
      busy.current = false;
      setSharing(false);
    }
  }, [inviterName, runWithoutLocking, toast]);

  const email = useCallback(async (person: InviteTarget): Promise<boolean> => {
    if (busy.current) return false;
    busy.current = true;
    setEmailing(true);
    try {
      await invitePerson(person.id);
      toast.success(
        person.email ? `Invite sent to ${person.email}` : "Invite sent",
        `${personFirstName(person.name)} will get an email with how to join LenaDena.`,
      );
      return true;
    } catch (error) {
      toast.error(`Couldn't email ${personFirstName(person.name)}`, errorMessage(error));
      return false;
    } finally {
      busy.current = false;
      setEmailing(false);
    }
  }, [invitePerson, toast]);

  return { share, email, sharing, emailing };
}
