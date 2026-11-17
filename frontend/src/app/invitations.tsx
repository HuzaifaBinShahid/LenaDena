import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { expiryText, sortedInvitations } from "@/features/groups/groupRules";
import { useLedger } from "@/features/ledger/LedgerProvider";
import { errorMessage } from "@/lib/api";

/**
 * Invitations to groups, addressed to this account's own email, answered here: nobody is added to a group without
 * saying yes, and nothing on the server tells the person who invited you whether this account exists.
 */
export default function InvitationsScreen() {
  const { invitations, acceptInvitation, declineInvitation } = useLedger();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const answer = async (id: string, accept: boolean, groupName: string) => {
    setBusy(`${accept ? "accept" : "decline"}:${id}`);
    try {
      if (accept) {
        const group = await acceptInvitation(id);
        router.replace({ pathname: "/group/[id]", params: { id: group.id } });
        toast.success(`You joined ${group.name}`, "Its shared expenses and balances now appear in your plan.");
      } else {
        await declineInvitation(id);
        toast.info("Invitation declined", `You won't be added to ${groupName}.`);
      }
    } catch (error) {
      toast.error(accept ? "Couldn't join the group" : "Couldn't decline", errorMessage(error, "The invitation may have expired."));
    } finally {
      setBusy(null);
    }
  };

  const items = sortedInvitations(invitations);
  return (
    <Screen>
      <PageHeader title="Invitations" subtitle="Join a group only if you want to" />
      {items.length === 0 ? (
        <EmptyState icon="mail" title="No invitations right now" detail="When someone invites your email address to a group, it shows up here." action={{ label: "Go back", onPress: () => (router.canGoBack() ? router.back() : router.replace("/")) }} />
      ) : (
        <View className="gap-4">
          {items.map((item) => (
            <View key={item.id} className="gap-4 rounded-[24px] border border-line bg-raised p-4">
              <View>
                <Text className="text-lg font-bold text-ink">{item.groupName}</Text>
                <Text className="mt-1 text-sm leading-5 text-slate">{item.invitedBy} invited you. {expiryText(item.expiresAt)}.</Text>
              </View>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Button label="Decline" variant="secondary" size="lg" fullWidth loading={busy === `decline:${item.id}`} disabled={busy !== null && busy !== `decline:${item.id}`} onPress={() => void answer(item.id, false, item.groupName)} />
                </View>
                <View className="flex-[1.5]">
                  <Button label="Accept" icon="check" size="lg" fullWidth loading={busy === `accept:${item.id}`} disabled={busy !== null && busy !== `accept:${item.id}`} onPress={() => void answer(item.id, true, item.groupName)} />
                </View>
              </View>
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}
