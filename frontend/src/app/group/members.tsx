import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { ConfirmDelete } from "@/components/ledger/ConfirmDelete";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Screen } from "@/components/ui/Screen";
import { Spinner } from "@/components/ui/Spinner";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { canRemoveMember, expiryText, inviteEmailError, leaveBlockedText, removeBlockedText, roleLabel } from "@/features/groups/groupRules";
import { canRemind, remindOutcome, type NudgeStatus } from "@/features/push/pushRules";
import { useShare } from "@/features/share/useShare";
import { useLedger } from "@/features/ledger/LedgerProvider";
import type { GroupPeople, GroupPerson } from "@/features/ledger/types";
import { ApiError, errorMessage } from "@/lib/api";
import { formatMoney } from "@/lib/format";

type Confirming = { kind: "remove"; member: GroupPerson } | { kind: "leave" } | null;

/**
 * Members of one group: who is in it, add someone by email (an account sees the invitation in its app and says yes),
 * the invitations waiting for an answer, rename, and leave. Remove and leave are refused while money is open, and the
 * screen says why before asking.
 */
export default function GroupMembersScreen() {
  const params = useLocalSearchParams<{ groupId?: string }>();
  const groupId = typeof params.groupId === "string" ? params.groupId : "";
  const { plan, getGroupPeople, inviteByEmail, removeMember, leaveGroup, renameGroup, remindMember } = useLedger();
  const { shareReminder } = useShare();
  const toast = useToast();
  const group = plan.groups.find((item) => item.id === groupId);
  const [people, setPeople] = useState<GroupPeople>();
  const [loadError, setLoadError] = useState("");
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<"invite" | "rename" | "remove" | "leave" | null>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);
  /** The member a reminder is being sent to. */
  const [reminding, setReminding] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!groupId) return;
    try {
      setPeople(await getGroupPeople(groupId));
      setLoadError("");
    } catch (error) {
      setLoadError(errorMessage(error, "The group may have been deleted, or you may have left it."));
    }
  }, [getGroupPeople, groupId]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (group) setName(group.name);
  }, [group?.id, group?.name]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/"));

  if (!groupId || loadError) {
    return (
      <Screen>
        <PageHeader title="Members" />
        <EmptyState icon="alert-circle" title="This group isn't available" detail={loadError || "Open it from the group's page."} action={{ label: "Go back", onPress: goBack }} />
      </Screen>
    );
  }
  if (!people || !group) {
    return (
      <Screen>
        <PageHeader title="Members" subtitle={group?.name ?? "Loading"} />
        <View style={{ alignItems: "center", gap: 10, paddingVertical: 40 }}>
          <Spinner />
          <Text className="text-[13px] font-semibold text-slate">Loading the members</Text>
        </View>
      </Screen>
    );
  }

  const viewer = { id: plan.user.id, role: group.role };
  const others = people.members.filter((member) => member.id !== viewer.id).length;
  const me = people.members.find((member) => member.id === viewer.id);
  const emailError = emailTouched ? inviteEmailError(email) : undefined;

  const send = async () => {
    setEmailTouched(true);
    if (inviteEmailError(email)) return;
    setBusy("invite");
    try {
      await inviteByEmail(group.id, email.trim());
      toast.success("Invitation sent", `${email.trim()} will get an email. If they already use LenaDena, they can also answer it in the app.`);
      setEmail("");
      setEmailTouched(false);
      await load();
    } catch (error) {
      toast.error("Couldn't send the invitation", errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const saveName = async () => {
    setBusy("rename");
    try {
      await renameGroup(group.id, name.trim());
      toast.success("Group renamed", `It's now called ${name.trim()}.`);
      await load();
    } catch (error) {
      toast.error("Couldn't rename the group", errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const confirmRemove = async (member: GroupPerson) => {
    setBusy("remove");
    try {
      await removeMember(group.id, member.id);
      toast.success(`${member.name} was removed`, "They no longer see this group.");
      setConfirming(null);
      await load();
    } catch (error) {
      setConfirming(null);
      toast.error("Couldn't remove them", errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const confirmLeave = async () => {
    setBusy("leave");
    try {
      await leaveGroup(group.id);
      router.replace("/");
      toast.success(`You left ${group.name}`, "It's no longer in your plan.");
    } catch (error) {
      setConfirming(null);
      toast.error("Couldn't leave the group", errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  /**
   * "Remind" on someone who owes you: a push notification when they switched them on. Otherwise (no phone registered,
   * Firebase down, or not set up on the server) the same words go through the share sheet, so a tap always ends with
   * the reminder reaching them one way or another.
   */
  const remind = async (member: GroupPerson) => {
    setReminding(member.id);
    try {
      let status: NudgeStatus;
      try {
        status = await remindMember(group.id, member.id);
      } catch (error) {
        if (error instanceof ApiError && error.code === "push_unavailable") status = "unavailable";
        else throw error;
      }
      const outcome = remindOutcome(status, member.name);
      if (outcome.kind === "sent") {
        toast.success(outcome.title, outcome.message);
        return;
      }
      toast.info(outcome.title, outcome.message);
      await shareReminder({ memberId: member.id, memberName: member.name, amountMinor: member.owesYouMinor, currency: group.currency, groupName: group.name });
    } catch (error) {
      // Not owed any more, already reminded today and the daily limit are answers, not failures.
      const answered = error instanceof ApiError && ["nothing_owed", "nudge_cooldown", "nudge_limit_reached"].includes(error.code ?? "");
      if (answered) toast.info("Reminder not sent", errorMessage(error));
      else toast.error("Couldn't send the reminder", errorMessage(error));
    } finally {
      setReminding(null);
    }
  };

  const askRemove = (member: GroupPerson) => {
    const blocked = removeBlockedText(member);
    if (blocked) toast.info("Settle up first", blocked);
    else setConfirming({ kind: "remove", member });
  };
  const askLeave = () => {
    const blocked = leaveBlockedText(viewer, others, me?.settled ?? true);
    if (blocked) toast.info("You can't leave yet", blocked);
    else setConfirming({ kind: "leave" });
  };

  return (
    <Screen>
      <PageHeader title="Members" subtitle={group.name} />
      <View className="gap-4">
        <View className="gap-3 rounded-[24px] border border-line bg-raised p-4">
          <Text className="text-lg font-bold text-ink">In this group</Text>
          {people.members.map((member) => {
            const reminder = canRemind(viewer.id, member);
            const removable = canRemoveMember(viewer, member);
            const removeButton = removable ? (
              <Button label="Remove" icon="close" size="sm" variant="ghost" disabled={busy !== null || reminding !== null} onPress={() => askRemove(member)} accessibilityHint={`Takes ${member.name} out of ${group.name}`} />
            ) : null;
            return (
              <View key={member.id} className="gap-2.5">
                <View className="flex-row items-center gap-3">
                  <Avatar name={member.name} uri={member.avatarUrl} size="sm" shape="circle" />
                  <View className="min-w-0 flex-1">
                    <Text className="font-bold text-ink" numberOfLines={1}>{member.name}{member.id === viewer.id ? " (you)" : ""}</Text>
                    <Text className="text-xs text-slate">{roleLabel(member.role)}{reminder ? ` · owes you ${formatMoney(member.owesYouMinor, group.currency)}` : ""}</Text>
                  </View>
                  {/* Remove alone sits beside the name; with Remind the two go under it, so the name never gets squeezed. */}
                  {!reminder ? removeButton : null}
                </View>
                {reminder ? (
                  <View className="flex-row flex-wrap justify-end gap-2">
                    <Button label="Remind" icon="bell" size="sm" variant="secondary" loading={reminding === member.id} disabled={busy !== null || (reminding !== null && reminding !== member.id)} onPress={() => void remind(member)} accessibilityHint={`Sends ${member.name} a reminder that they owe you in ${group.name}`} />
                    {removeButton}
                  </View>
                ) : null}
              </View>
            );
          })}
          {confirming?.kind === "remove" ? (
            <ConfirmDelete
              title={`Remove ${confirming.member.name}?`}
              message={`${confirming.member.name} will no longer see ${group.name}, and the group's activity will note that they were removed. Their past expenses stay on the books.`}
              confirmLabel="Remove"
              cancelLabel="Keep them"
              busy={busy === "remove"}
              onConfirm={() => void confirmRemove(confirming.member)}
              onCancel={() => setConfirming(null)}
            />
          ) : null}
        </View>

        <View className="gap-3 rounded-[24px] border border-line bg-raised p-4">
          <View>
            <Text className="text-lg font-bold text-ink">Add someone</Text>
            <Text className="mt-1 text-xs leading-5 text-slate">Type their email. They get an email, and if they already use LenaDena the invitation also appears in their app, where they accept it. Nobody is added without saying yes.</Text>
          </View>
          <Field label="Email address" required error={emailError}>
            <Input value={email} onChangeText={setEmail} placeholder="friend@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} leadingIcon="mail" invalid={Boolean(emailError)} />
          </Field>
          <Button label="Send invitation" icon="user-plus" size="lg" fullWidth loading={busy === "invite"} disabled={busy !== null && busy !== "invite"} onPress={() => void send()} />
          {people.invitations.length ? (
            <View className="mt-1 gap-2">
              <Text className="text-[11px] font-bold uppercase tracking-[1.2px] text-slate">Waiting for an answer</Text>
              {people.invitations.map((invitation) => (
                <View key={invitation.id}>
                  <Text className="font-semibold text-ink" numberOfLines={1}>{invitation.email}</Text>
                  <Text className="text-xs text-slate">Invited by {invitation.invitedBy}. {expiryText(invitation.expiresAt)}.</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {people.canManage ? (
          <View className="gap-3 rounded-[24px] border border-line bg-raised p-4">
            <Text className="text-lg font-bold text-ink">Group name</Text>
            <Field label="Name" error={name.trim().length > 0 && (name.trim().length < 2 || name.trim().length > 80) ? "Use 2 to 80 characters." : undefined}>
              <Input value={name} onChangeText={setName} placeholder="Weekend crew" leadingIcon="users" maxLength={80} />
            </Field>
            <Button label="Save name" icon="check" variant="secondary" fullWidth loading={busy === "rename"} disabled={busy !== null && busy !== "rename" || name.trim().length < 2 || name.trim() === group.name} onPress={() => void saveName()} />
          </View>
        ) : null}

        {confirming?.kind === "leave" ? (
          <ConfirmDelete
            title={`Leave ${group.name}?`}
            message="It will disappear from your plan, and the group's activity will note that you left. You can be invited back."
            confirmLabel="Leave group"
            cancelLabel="Stay"
            busy={busy === "leave"}
            onConfirm={() => void confirmLeave()}
            onCancel={() => setConfirming(null)}
          />
        ) : (
          <Button label="Leave group" icon="log-out" variant="danger" size="lg" fullWidth disabled={busy !== null} onPress={askLeave} />
        )}
      </View>
    </Screen>
  );
}
