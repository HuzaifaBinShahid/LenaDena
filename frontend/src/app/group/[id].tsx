import { useMemo, type ReactNode } from "react";
import { StyleSheet, Text as NativeText, useWindowDimensions, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  CARD,
  CardLoadingBody,
  CardOfflineBody,
  CardPrompt,
  describeGroupCard,
  heroCardSize,
  LayeredGroupCard,
  StageFab,
} from "@/components/groups/LayeredGroupCard";
import { MemberRow } from "@/components/groups/MemberRow";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { LedgerList } from "@/components/ui/LedgerRow";
import { Screen } from "@/components/ui/Screen";
import { Spinner } from "@/components/ui/Spinner";
import { groupSkin } from "@/features/groups/groupSkin";
import { useGroupInvite } from "@/features/groups/useGroupInvite";
import { GroupExpenses } from "@/features/home/GroupsView";
import { indexGroupTransactions } from "@/features/ledger/groupLedger";
import { useLedger } from "@/features/ledger/LedgerProvider";
import { getPlanState } from "@/features/ledger/planState";
import type { TransactionItem } from "@/features/ledger/types";
import { layout } from "@/theme/layout";
import { shadows } from "@/theme/shadows";
import { colors } from "@/theme/tokens";

const ROLE_LABELS = { owner: "Owner", admin: "Admin", member: "Member" } as const;
const NO_ROWS: readonly TransactionItem[] = [];

/** Screen gutter from `Screen` (px-[18px]); the band and member row break out of it. */
const SCREEN_GUTTER = 18;
const BAND_PAD = 20;

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { plan, connection, refresh } = useLedger();
  const { width: windowWidth } = useWindowDimensions();
  const column = Math.min(windowWidth, layout.contentMax);
  const card = heroCardSize(column, true);
  const planState = getPlanState(plan, connection);
  const group = plan.groups.find((item) => item.id === id);
  const transactions = plan.transactions;
  const rows = useMemo(() => (id ? indexGroupTransactions({ transactions }).get(id) : undefined) ?? NO_ROWS, [id, transactions]);
  const { invite, inviting } = useGroupInvite(group);
  const stageHeight = CARD.PAD_TOP + card.height + CARD.PAD_BOTTOM;

  if (!group) {
    const loading = planState === "loading";
    const offline = planState === "offline";
    return (
      <Screen>
        <Band title="Group">
          <View style={[styles.stage, { height: stageHeight }]}>
            <LayeredGroupCard
              variant="hero"
              width={card.width}
              height={card.height}
              skin={groupSkin()}
              art="muted"
              glyph="users"
              name={loading || offline ? "Group" : "Group unavailable"}
              label="Your position"
              body={loading
                ? <CardLoadingBody label="Loading this group" />
                : offline
                  ? <CardOfflineBody title="Couldn't load this group" detail="Check your connection" onRetry={() => void refresh()} />
                  : <CardPrompt label="Your position" text="Nothing to show" />}
              chip={loading || offline ? undefined : { icon: "alert-circle", label: "Unavailable", color: colors.lavender }}
              accessibilityLabel={loading ? "Loading this group" : offline ? "Couldn't load this group" : "Group unavailable"}
            />
          </View>
        </Band>
        <View style={styles.sectionGap}>
          {loading ? (
            <LedgerList>
              <View style={styles.loadingBlock}>
                <Spinner />
                <NativeText maxFontSizeMultiplier={1.4} style={styles.loadingLabel}>Loading expenses</NativeText>
              </View>
            </LedgerList>
          ) : offline ? (
            <LedgerList>
              <EmptyState variant="inset" icon="alert-circle" title="Waiting for LenaDena" detail="Your expenses will appear once LenaDena reconnects." />
            </LedgerList>
          ) : (
            <EmptyState
              icon="users"
              illustration="groups"
              title="This group isn't available"
              detail="It may have been deleted, or you're no longer a member."
              action={{ label: "Back", icon: "arrow-left", onPress: () => router.back() }}
            />
          )}
        </View>
      </Screen>
    );
  }

  const summary = describeGroupCard(group, rows.length > 0, plan.user.id);
  const role = ROLE_LABELS[group.role] ?? "Member";
  const subtitle = summary.solo
    ? `Just you · ${group.currency} · ${role}`
    : `${group.members.length} members · ${group.currency} · ${role}`;
  const addExpense = () => router.push({ pathname: "/expense/new", params: { groupId: group.id } });

  return (
    <Screen>
      <Band title={summary.name} subtitle={subtitle}>
        <View style={[styles.stage, { height: stageHeight }]}>
          <LayeredGroupCard
            variant="hero"
            width={card.width}
            height={card.height}
            skin={summary.skin}
            art="full"
            glyph="users"
            name={summary.name}
            currency={summary.currency}
            label="Your position"
            amount={summary.amount}
            meta={summary.meta}
            chip={summary.chip}
            accessibilityLabel={summary.accessibilityLabel}
          />
          <StageFab cardHeight={card.height} onPress={addExpense} accessibilityLabel={`Add expense to ${summary.name}`} />
        </View>
      </Band>

      <View style={styles.actions}>
        <View style={styles.action}>
          <Button label="Add expense" icon="plus" fullWidth onPress={addExpense} />
        </View>
        <View style={styles.action}>
          {summary.solo ? (
            <Button label="Invite" icon="user-plus" variant="secondary" fullWidth loading={inviting} onPress={invite} />
          ) : (
            <Button
              label="I paid"
              icon="send"
              variant="secondary"
              fullWidth
              onPress={() => router.push({ pathname: "/settlement/new", params: { groupId: group.id } })}
            />
          )}
        </View>
      </View>

      <MemberRow
        group={group}
        currentUserId={plan.user.id}
        mode="members"
        onInvite={() => void invite()}
        inviting={inviting}
        style={styles.members}
      />

      <GroupExpenses
        group={group}
        planState={planState}
        rows={rows}
        currentUserId={plan.user.id}
        mode="full"
        onInvite={() => void invite()}
        style={styles.sectionGap}
      />
    </Screen>
  );
}

/** Full-bleed lavender band with the page header; its colour also fills the iOS pull-down overscroll above it. */
function Band({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <View style={[styles.band, shadows.band]}>
      <View pointerEvents="none" style={styles.overscroll} />
      <PageHeader title={title} subtitle={subtitle} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    marginHorizontal: -SCREEN_GUTTER,
    paddingHorizontal: BAND_PAD,
    paddingBottom: 20,
    backgroundColor: colors.lavenderSoft,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  overscroll: {
    position: "absolute",
    top: -800,
    left: 0,
    right: 0,
    height: 800,
    backgroundColor: colors.lavenderSoft,
  },
  // The stage spans the band edge to edge, so the card sits 76pt from the screen edge and StageFab lines up with the Groups tab.
  stage: {
    marginHorizontal: -BAND_PAD,
    paddingLeft: CARD.STAGE_LEFT,
    paddingTop: CARD.PAD_TOP,
  },
  actions: {
    marginTop: 20,
    flexDirection: "row",
    gap: 10,
  },
  action: {
    flex: 1,
  },
  members: {
    marginTop: 24,
    marginHorizontal: -SCREEN_GUTTER,
  },
  sectionGap: {
    marginTop: 28,
  },
  loadingBlock: {
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 28,
    paddingHorizontal: 20,
  },
  loadingLabel: {
    fontFamily: "Manrope_600SemiBold",
    fontSize: 13,
    lineHeight: 18,
    color: colors.slate,
  },
});
