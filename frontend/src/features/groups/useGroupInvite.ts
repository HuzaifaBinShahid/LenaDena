import { useCallback, useRef, useState } from "react";
import { Share } from "react-native";
import { useToast } from "@/components/ui/Toast";
import { useLedger } from "@/features/ledger/LedgerProvider";
import type { Group } from "@/features/ledger/types";
import { useAppLock } from "@/features/security/AppLockProvider";
import { errorMessage } from "@/lib/api";

/**
 * Creates an invite link and opens the share sheet (moved from group/[id]: createInvite → runWithoutLocking(Share.share) → toast.error).
 * Presses while an invite is in flight are ignored.
 */
export function useGroupInvite(group?: Group): { invite: () => Promise<void>; inviting: boolean } {
  const { createInvite } = useLedger();
  const { runWithoutLocking } = useAppLock();
  const toast = useToast();
  const [inviting, setInviting] = useState(false);
  const busy = useRef(false);
  const groupId = group?.id;
  const groupName = group?.name;

  const invite = useCallback(async () => {
    if (!groupId || !groupName || busy.current) return;
    busy.current = true;
    setInviting(true);
    try {
      const link = await createInvite(groupId);
      await runWithoutLocking(() => Share.share({
        title: `Join ${groupName}`,
        message: `Join ${groupName} on LenaDena: ${link.url}`,
      }));
    } catch (error) {
      toast.error("Couldn't create an invite", errorMessage(error));
    } finally {
      busy.current = false;
      setInviting(false);
    }
  }, [createInvite, groupId, groupName, runWithoutLocking, toast]);

  return { invite, inviting };
}
