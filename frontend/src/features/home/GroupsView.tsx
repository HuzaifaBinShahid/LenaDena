import { createElement, memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ListRenderItemInfo, NativeScrollEvent, NativeSyntheticEvent, StyleProp, ViewStyle } from "react-native";
import { FlatList, Platform, Text as NativeText, useWindowDimensions, View } from "react-native";
import Animated, { FadeIn, useReducedMotion } from "react-native-reanimated";
import { router } from "expo-router";
import { ExpenseViewChip } from "@/components/groups/ExpenseViewChip";
import { ExpenseViewSheet } from "@/components/groups/ExpenseViewSheet";
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
import { MemberRow, MemberRowCreate, MemberRowLoading } from "@/components/groups/MemberRow";
import { EmptyState } from "@/components/layout/EmptyState";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { Button } from "@/components/ui/Button";
import { EntryTile } from "@/components/ui/EntryTile";
import { Icon } from "@/components/ui/Icon";
import { LedgerList, LedgerRow } from "@/components/ui/LedgerRow";
import { Spinner } from "@/components/ui/Spinner";
import { Touch } from "@/components/ui/Touch";
import { groupSkin } from "@/features/groups/groupSkin";
import { useGroupInvite } from "@/features/groups/useGroupInvite";
import type { HomeTabProps } from "@/features/home/tab-props";
import {
  defaultGroupExpenseView,
  getGroupTransactions,
  indexGroupTransactions,
  type GroupExpenseView,
} from "@/features/ledger/groupLedger";
import { useLedger } from "@/features/ledger/LedgerProvider";
import { getPlanState, type PlanState } from "@/features/ledger/planState";
import { describeTransaction } from "@/features/ledger/rowCopy";
import type { Group, TransactionItem } from "@/features/ledger/types";
import { todayDate } from "@/lib/format";
import { layout } from "@/theme/layout";
import { shadows } from "@/theme/shadows";
import { makeStyles, useTheme } from "@/theme/ThemeProvider";
import { colors } from "@/theme/tokens";

const MAX_DOTS = 8;
const PREVIEW_ROWS = 5;
const PAGE_ROWS = 20;
const NO_ROWS: readonly TransactionItem[] = [];

function clampIndex(value: number, count: number) {
  return Math.min(Math.max(0, value), Math.max(0, count - 1));
}

/** Groups tab (§3.4): lavender band with the layered card carousel, the member row and the group's recent expenses. */
export function GroupsView(_props: HomeTabProps) {
  const { plan, connection, refresh } = useLedger();
  const styles = useStyles();
  const { width: windowWidth } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const column = Math.min(windowWidth, layout.contentMax);
  const card = heroCardSize(column);
  const snap = card.width + CARD.GAP;
  const planState = getPlanState(plan, connection);
  const groups = plan.groups;
  const transactions = plan.transactions;
  const rowsByGroup = useMemo(() => indexGroupTransactions({ transactions }), [transactions]);
  const listRef = useRef<FlatList<Group>>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string>();
  const selectedIndex = clampIndex(groups.findIndex((group) => group.id === selectedGroupId), groups.length);
  const selected = groups[selectedIndex];
  const { invite, inviting } = useGroupInvite(selected);
  const waiting = planState === "loading" || planState === "offline";

  // A refresh that removes the selected group falls back to the first card.
  useEffect(() => {
    if (selectedGroupId && !groups.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(undefined);
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
  }, [groups, selectedGroupId]);

  const selectAt = useCallback((offsetX: number) => {
    const next = groups[clampIndex(Math.round(offsetX / snap), groups.length)];
    if (next) setSelectedGroupId((current) => (current === next.id ? current : next.id));
  }, [groups, snap]);

  const onMomentumScrollEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    selectAt(event.nativeEvent.contentOffset.x);
  }, [selectAt]);

  const showGroup = useCallback((index: number) => {
    const next = groups[clampIndex(index, groups.length)];
    if (!next) return;
    setSelectedGroupId(next.id);
    listRef.current?.scrollToOffset({ offset: clampIndex(index, groups.length) * snap, animated: !reduceMotion });
  }, [groups, reduceMotion, snap]);

  const renderItem = useCallback(({ item }: ListRenderItemInfo<Group>) => (
    <GroupSlide group={item} hasActivity={(rowsByGroup.get(item.id)?.length ?? 0) > 0} currentUserId={plan.user.id} width={card.width} height={card.height} />
  ), [card.height, card.width, plan.user.id, rowsByGroup]);

  const getItemLayout = useCallback((_: ArrayLike<Group> | null | undefined, index: number) => ({
    // FlatList measures content, not the container's stage padding. Include the separator so this
    // virtual measurement matches `snapToInterval`; otherwise a swipe can settle between cards.
    length: snap,
    offset: index * snap,
    index,
  }), [snap]);

  const detail = planState === "loading"
    ? "Loading your circles"
    : planState === "offline"
      ? "Your circles will show once LenaDena reconnects."
      : groups.length > 1
        ? "Swipe cards to switch groups"
        : groups.length === 1
          ? "Your circle"
          : "Split trips, flats and dinners with the people you share them with.";

  const stageHeight = CARD.PAD_TOP + card.height + CARD.PAD_BOTTOM;
  const openCreate = () => router.push("/group/new");

  let stage: ReactNode;
  if (planState === "loading") {
    stage = (
      <View style={[styles.stage, { height: stageHeight }]}>
        <LayeredGroupCard
          variant="hero"
          width={card.width}
          height={card.height}
          skin={groupSkin()}
          art="muted"
          glyph="users"
          name="Your groups"
          label="Your position"
          body={<CardLoadingBody label="Loading your groups" />}
          accessibilityLabel="Loading your groups"
        />
      </View>
    );
  } else if (planState === "offline") {
    stage = (
      <View style={[styles.stage, { height: stageHeight }]}>
        <LayeredGroupCard
          variant="hero"
          width={card.width}
          height={card.height}
          skin={groupSkin()}
          art="muted"
          glyph="users"
          name="Your groups"
          label="Your position"
          body={<CardOfflineBody title="Couldn't load groups" detail="Check your connection" onRetry={() => void refresh()} />}
          accessibilityLabel="Couldn't load groups. Check your connection."
        />
      </View>
    );
  } else if (!groups.length) {
    stage = (
      <View style={[styles.stage, { height: stageHeight }]}>
        <LayeredGroupCard
          variant="hero"
          width={card.width}
          height={card.height}
          skin={groupSkin()}
          art="muted"
          glyph="users"
          name="No groups yet"
          label="Your position"
          body={<CardPrompt label="Your position" text="Start a circle" />}
          meta="Invite friends next"
          chip={{ icon: "sparkles", label: "No balance yet", color: colors.lavender }}
          accessibilityLabel="Create your first group"
          accessibilityHint="Opens the new group form"
          onPress={openCreate}
        />
        <StageFab cardHeight={card.height} onPress={openCreate} accessibilityLabel="Create a group" />
      </View>
    );
  } else {
    stage = (
      <View style={{ height: stageHeight }}>
        <FlatList
          ref={listRef}
          data={groups}
          keyExtractor={(group) => group.id}
          renderItem={renderItem}
          horizontal
          showsHorizontalScrollIndicator={false}
          ItemSeparatorComponent={CardSeparator}
          snapToInterval={snap}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum
          directionalLockEnabled
          nestedScrollEnabled
          getItemLayout={getItemLayout}
          windowSize={5}
          initialNumToRender={3}
          style={[styles.carousel, { height: stageHeight }]}
          contentContainerStyle={{
            paddingLeft: CARD.STAGE_LEFT,
            paddingRight: Math.max(0, column - CARD.STAGE_LEFT - card.width),
            paddingTop: CARD.PAD_TOP,
            paddingBottom: CARD.PAD_BOTTOM,
          }}
          onMomentumScrollEnd={onMomentumScrollEnd}
          // React Native Web does not fire momentum events, so the web build also follows plain scroll events.
          onScroll={Platform.OS === "web" ? onMomentumScrollEnd : undefined}
          scrollEventThrottle={32}
        />
        {selected ? (
          <StageFab
            cardHeight={card.height}
            onPress={() => router.push({ pathname: "/expense/new", params: { groupId: selected.id } })}
            accessibilityLabel={`Add expense to ${selected.name}`}
          />
        ) : null}
      </View>
    );
  }

  return (
    <View>
      <View style={styles.band}>
        <View style={[styles.column, { width: column }]}>
          <View style={styles.topRow}>
            <NativeText maxFontSizeMultiplier={1.4} style={styles.topDetail}>{detail}</NativeText>
            <Button label="New group" icon="plus" size="sm" variant="secondary" onPress={openCreate} />
          </View>
          <View style={styles.stageGap}>{stage}</View>
          {!waiting && groups.length > 1 ? (
            <CarouselPager groups={groups} index={selectedIndex} cardWidth={card.width} onSelect={showGroup} />
          ) : null}
        </View>
      </View>

      <View style={[styles.column, { width: column }]}>
        {planState === "loading" ? (
          <MemberRowLoading style={styles.memberGap} />
        ) : planState === "offline" ? null : selected ? (
          <MemberRow group={selected} currentUserId={plan.user.id} mode="members" onInvite={() => void invite()} inviting={inviting} style={styles.memberGap} />
        ) : (
          <MemberRowCreate onPress={openCreate} style={styles.memberGap} />
        )}

        <GroupExpenses
          group={selected}
          planState={planState}
          rows={selected ? rowsByGroup.get(selected.id) ?? NO_ROWS : NO_ROWS}
          currentUserId={plan.user.id}
          mode="preview"
          onInvite={() => void invite()}
          style={styles.expensesGap}
        />
      </View>
    </View>
  );
}

function CardSeparator() {
  return <View style={separatorStyle} />;
}

const GroupSlide = memo(function GroupSlide({ group, hasActivity, currentUserId, width, height }: { group: Group; hasActivity: boolean; currentUserId: string; width: number; height: number }) {
  const card = describeGroupCard(group, hasActivity, currentUserId);
  const groupId = group.id;
  const open = useCallback(() => router.push({ pathname: "/group/[id]", params: { id: groupId } }), [groupId]);
  return (
    <LayeredGroupCard
      variant="hero"
      width={width}
      height={height}
      skin={card.skin}
      art="full"
      glyph="users"
      name={card.name}
      currency={card.currency}
      label="Your position"
      amount={card.amount}
      meta={card.meta}
      chip={card.chip}
      accessibilityLabel={card.accessibilityLabel}
      accessibilityHint="Opens the group"
      onPress={open}
    />
  );
});

function CarouselPager({ groups, index, cardWidth, onSelect }: { groups: readonly Group[]; index: number; cardWidth: number; onSelect: (index: number) => void }) {
  const styles = useStyles();
  if (groups.length <= MAX_DOTS) {
    return createElement(
      View,
      { accessibilityRole: "tablist", style: [styles.pager, { width: cardWidth }] },
      groups.map((group, dotIndex) => {
        const active = dotIndex === index;
        return (
          <Touch
            key={group.id}
            onPress={() => onSelect(dotIndex)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`Show ${group.name}`}
            pressedScale={0.9}
            containerStyle={styles.dotSlot}
            pressableStyle={styles.dotSlot}
          >
            <View style={[styles.dotInner, active ? styles.dotActive : styles.dotInactive]} />
          </Touch>
        );
      }),
    );
  }
  const atStart = index <= 0;
  const atEnd = index >= groups.length - 1;
  return (
    <View style={[styles.pager, { width: cardWidth }]}>
      <PagerArrow direction="left" disabled={atStart} onPress={() => onSelect(index - 1)} label={`Show ${groups[index - 1]?.name ?? "previous group"}`} />
      <NativeText maxFontSizeMultiplier={1.3} style={styles.pagerCount} accessibilityLabel={`Group ${index + 1} of ${groups.length}`}>
        {`${index + 1} of ${groups.length}`}
      </NativeText>
      <PagerArrow direction="right" disabled={atEnd} onPress={() => onSelect(index + 1)} label={`Show ${groups[index + 1]?.name ?? "next group"}`} />
    </View>
  );
}

function PagerArrow({ direction, disabled, onPress, label }: { direction: "left" | "right"; disabled: boolean; onPress: () => void; label: string }) {
  const styles = useStyles();
  const { isDark } = useTheme();
  return (
    <Touch
      onPress={onPress}
      disabled={disabled}
      haptic
      pressedScale={0.9}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      containerStyle={styles.arrowSlot}
      pressableStyle={[styles.arrowSlot, disabled ? styles.arrowDisabled : null]}
    >
      <View style={styles.arrowCircle}>
        <Icon name={direction === "left" ? "arrow-left" : "arrow-right"} size={18} color={isDark ? colors.lavender : colors.violetStrong} />
      </View>
    </Touch>
  );
}

export type GroupExpensesProps = {
  /** The selected group; undefined when there are no groups (or none loaded yet). */
  group: Group | undefined;
  planState: PlanState;
  rows: readonly TransactionItem[];
  currentUserId: string;
  /** preview: first 5 rows plus "See all" (Groups tab). full: 20 at a time with "Show more" (group detail). */
  mode: "preview" | "full";
  onInvite: () => void;
  style?: StyleProp<ViewStyle>;
};

/** "Recent expenses" section with the sort/filter chip and sheet, and every empty, loading and offline state (§3.4, §3.5). */
export function GroupExpenses({ group, planState, rows, currentUserId, mode, onInvite, style }: GroupExpensesProps) {
  const styles = useStyles();
  const { colors: c } = useTheme();
  const reduceMotion = useReducedMotion();
  const [view, setView] = useState<GroupExpenseView>(defaultGroupExpenseView);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [limit, setLimit] = useState(mode === "preview" ? PREVIEW_ROWS : PAGE_ROWS);
  const visibleRows = useMemo(() => getGroupTransactions([...rows], view), [rows, view]);
  const today = todayDate();
  const hasRows = rows.length > 0;
  const groupId = group?.id;

  // A new view or group starts from the first page again.
  useEffect(() => {
    setLimit(mode === "preview" ? PREVIEW_ROWS : PAGE_ROWS);
  }, [groupId, mode, view]);

  const changeView = useCallback((next: GroupExpenseView) => setView(next), []);
  const addExpense = () => {
    if (groupId) router.push({ pathname: "/expense/new", params: { groupId } });
  };

  let content: ReactNode;
  if (planState === "loading" && !group) {
    content = (
      <LedgerList>
        <View style={styles.loadingBlock}>
          <Spinner />
          <NativeText maxFontSizeMultiplier={1.4} style={styles.loadingLabel}>Loading expenses</NativeText>
        </View>
      </LedgerList>
    );
  } else if (planState === "offline" && !group) {
    content = (
      <LedgerList>
        <EmptyState variant="inset" icon="alert-circle" title="Waiting for LenaDena" detail="Your expenses will appear once LenaDena reconnects." />
      </LedgerList>
    );
  } else if (!group) {
    content = (
      <LedgerList>
        <EmptyState
          variant="inset"
          icon="file-text"
          illustration="expenses"
          title="No expenses yet"
          detail="Once you're in a group, shared costs show up here with who owes whom."
        />
      </LedgerList>
    );
  } else if (!hasRows) {
    const solo = !group.members.some((member) => member.id !== currentUserId);
    const name = group.name.trim() || "this group";
    content = solo ? (
      <LedgerList>
        <EmptyState
          variant="inset"
          icon="user-plus"
          illustration="groups"
          title="Invite friends to start splitting"
          detail={`${name} only has you so far. Share an invite link, then add expenses to split.`}
          action={{ label: "Invite friends", icon: "user-plus", onPress: onInvite }}
          secondaryAction={{ label: "Add expense", icon: "plus", onPress: addExpense }}
        />
      </LedgerList>
    ) : (
      <LedgerList>
        <EmptyState
          variant="inset"
          icon="file-text"
          illustration="expenses"
          title={`No expenses in ${name} yet`}
          detail="Add the first shared cost. LenaDena splits it and keeps track of who owes whom."
          action={{ label: "Add expense", icon: "plus", onPress: addExpense }}
        />
      </LedgerList>
    );
  } else if (!visibleRows.length) {
    content = (
      <LedgerList>
        <EmptyState
          variant="inset"
          icon="filter"
          title="Nothing matches this view"
          detail="Try another sort or show all expenses."
          action={{ label: "Show all", onPress: () => setView({ ...defaultGroupExpenseView }) }}
        />
      </LedgerList>
    );
  } else {
    const shown = visibleRows.slice(0, limit);
    const remaining = visibleRows.length - shown.length;
    content = (
      <>
        <LedgerList>
          {shown.map((item, index) => {
            const copy = describeTransaction(item, { context: "group", today });
            return (
              <LedgerRow
                key={item.id}
                divider={index > 0}
                leading={<EntryTile icon={copy.tile.icon} tone={copy.tile.tone} badge={copy.tile.badge} ringColor={c.raised} />}
                title={copy.title}
                subtitle={copy.subtitle}
                amount={copy.amount}
                status={copy.status}
                accessibilityLabel={copy.accessibilityLabel}
              />
            );
          })}
        </LedgerList>
        {remaining > 0 ? (
          <View style={styles.more}>
            {mode === "preview" ? (
              <Button
                label={`See all ${visibleRows.length} in ${group.name}`}
                icon="arrow-right"
                iconSide="right"
                variant="ghost"
                onPress={() => router.push({ pathname: "/group/[id]", params: { id: group.id } })}
              />
            ) : (
              <Button label="Show more" icon="chevron-down" iconSide="right" variant="ghost" onPress={() => setLimit((current) => current + PAGE_ROWS)} />
            )}
          </View>
        ) : null}
      </>
    );
  }

  return (
    <View style={style}>
      <SectionHeader
        title="Recent expenses"
        trailing={group && hasRows ? <ExpenseViewChip view={view} onPress={() => setSheetVisible(true)} /> : undefined}
      />
      {createElement(
        Animated.View,
        { key: groupId ?? planState, entering: reduceMotion ? undefined : FadeIn.duration(180) },
        content,
      )}
      {group && hasRows ? (
        <ExpenseViewSheet visible={sheetVisible} view={view} onChange={changeView} onClose={() => setSheetVisible(false)} />
      ) : null}
    </View>
  );
}

const separatorStyle = { width: CARD.GAP } as const;

const useStyles = makeStyles((c, { isDark }) => ({
  // The lavender band under the header; app/index.tsx paints the header above it in the same c.lavenderSoft.
  band: {
    backgroundColor: c.lavenderSoft,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    paddingBottom: 16,
    // A shadow can't separate dark surfaces, so in dark the band's lower edge is a hairline instead.
    ...(isDark ? { borderBottomWidth: 1, borderBottomColor: c.line } : shadows.band),
  },
  column: {
    alignSelf: "center",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  topDetail: {
    flex: 1,
    minWidth: 0,
    fontFamily: "Manrope_500Medium",
    fontSize: 13,
    lineHeight: 18,
    color: c.slate,
  },
  stageGap: {
    marginTop: 12,
  },
  stage: {
    paddingLeft: CARD.STAGE_LEFT,
    paddingTop: CARD.PAD_TOP,
  },
  carousel: {
    flexGrow: 0,
  },
  pager: {
    marginTop: -14,
    marginLeft: CARD.STAGE_LEFT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  dotSlot: {
    width: 28,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  dotInner: {
    height: 6,
    borderRadius: 3,
  },
  // The active dot is the strongest mark on the band: violetStrong on the light band, lavender on the dark one.
  dotActive: {
    width: 18,
    backgroundColor: isDark ? colors.lavender : colors.violetStrong,
  },
  dotInactive: {
    width: 6,
    backgroundColor: isDark ? "rgba(181,165,255,0.3)" : colors.lavender,
  },
  pagerCount: {
    minWidth: 64,
    textAlign: "center",
    fontFamily: "Manrope_600SemiBold",
    fontSize: 12,
    lineHeight: 16,
    color: c.slate,
  },
  arrowSlot: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  arrowDisabled: {
    opacity: 0.4,
  },
  arrowCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.line,
    backgroundColor: c.raised,
    alignItems: "center",
    justifyContent: "center",
  },
  memberGap: {
    marginTop: 22,
  },
  expensesGap: {
    marginTop: 28,
    paddingHorizontal: 20,
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
    color: c.slate,
  },
  more: {
    marginTop: 8,
    alignItems: "center",
  },
}));
