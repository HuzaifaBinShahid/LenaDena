import { createElement, useMemo } from "react";
import { ScrollView, Text as NativeText, View } from "react-native";
import { router } from "expo-router";
import { ClayPeople } from "@/components/brand/Clay";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { PersonAvatar, personAvatarBox, type PersonAvatarStatus } from "@/components/people/PersonAvatar";
import { Button } from "@/components/ui/Button";
import { DashedOutline } from "@/components/ui/DashedOutline";
import { Icon } from "@/components/ui/Icon";
import { Touch } from "@/components/ui/Touch";
import { useLedger } from "@/features/ledger/LedgerProvider";
import { getPlanState } from "@/features/ledger/planState";
import { shortNames, sortPeopleForList, standingLine, type PersonSummary } from "@/features/people/people";
import { peopleHref, personFormHref, personHref } from "@/features/people/routes";
import { usePeopleSummaries } from "@/features/people/usePeople";
import { layout } from "@/theme/layout";
import { makeStyles, useTheme } from "@/theme/ThemeProvider";
import { colors } from "@/theme/tokens";

/** Disc diameter; with the status ring each bubble is personAvatarBox(DISC) = 64pt. */
const DISC = 56;
const BOX = personAvatarBox(DISC);
const ITEM_WIDTH = 72;
/** The strip shows this many people, then a "+N" bubble that opens the full list. */
const MAX_SHOWN = 10;

function avatarStatus(summary: PersonSummary): PersonAvatarStatus {
  if (summary.standing === "owed" || summary.standing === "owe" || summary.standing === "mixed") return summary.standing;
  return "none";
}

/**
 * The home Plan tab's People section, like the "send again" row in a banking app: an Add bubble, then everyone
 * with open balances (most recent first, ringed mint when they owe you and coral when you owe them), then the
 * rest A→Z. It brings its own 20pt gutters; the scroller runs to the column edges.
 */
export function PeopleStrip() {
  const { plan, connection, refresh } = useLedger();
  const styles = useStyles();
  const summaries = usePeopleSummaries();
  const sorted = useMemo(() => sortPeopleForList(summaries), [summaries]);
  const labels = useMemo(() => shortNames(sorted.map((summary) => summary.person)), [sorted]);
  const planState = getPlanState(plan, connection);
  const waiting = planState === "loading" || planState === "offline";
  const shown = sorted.slice(0, MAX_SHOWN);
  const hidden = sorted.length - shown.length;

  let body;
  if (planState === "loading") {
    body = <LoadingBubbles />;
  } else if (planState === "offline") {
    body = <OfflinePeopleCard onRetry={() => void refresh()} />;
  } else if (sorted.length === 0) {
    body = <EmptyPeopleCard />;
  } else {
    body = (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroller}
        accessibilityRole="list"
      >
        <AddBubble />
        {shown.map((summary) => (
          <PersonBubble key={summary.person.id} summary={summary} label={labels.get(summary.person.id) ?? summary.person.name} />
        ))}
        {hidden > 0 ? <MoreBubble count={hidden} /> : null}
      </ScrollView>
    );
  }

  return (
    <View>
      <SectionHeader
        title="People"
        {...(!waiting && sorted.length > 0 ? { action: { label: "See all", onPress: () => router.push(peopleHref) } } : {})}
        style={styles.header}
      />
      {body}
    </View>
  );
}

function PersonBubble({ summary, label }: { summary: PersonSummary; label: string }) {
  const { colors: c } = useTheme();
  const styles = useStyles();
  const { person } = summary;
  return (
    <Touch
      onPress={() => router.push(personHref(person.id))}
      pressedScale={0.94}
      haptic
      accessibilityRole="button"
      accessibilityLabel={`${person.name}. ${standingLine(summary)}.`}
      accessibilityHint="Opens their balance and history"
      containerStyle={styles.item}
      pressableStyle={styles.itemPressable}
    >
      <PersonAvatar name={person.name} uri={person.avatarUrl} size={DISC} status={avatarStatus(summary)} badge surfaceColor={c.canvas} />
      {createElement(NativeText, { numberOfLines: 1, maxFontSizeMultiplier: 1.2, style: styles.name }, label)}
    </Touch>
  );
}

function AddBubble() {
  const { colors: c, isDark } = useTheme();
  const styles = useStyles();
  return (
    <Touch
      onPress={() => router.push(personFormHref())}
      pressedScale={0.94}
      haptic
      accessibilityRole="button"
      accessibilityLabel="Add a person"
      containerStyle={styles.item}
      pressableStyle={styles.itemPressable}
    >
      <View style={styles.bubbleBox}>
        <DashedOutline width={BOX} height={BOX} radius={BOX / 2} color={isDark ? "rgba(181,165,255,0.55)" : "rgba(118,87,246,0.5)"} strokeWidth={1.5} dashCount={20} />
        <View style={styles.addDisc}>
          {/* Lavender on the deep violet-soft disc in dark mode; theme violet on the pale one. */}
          <Icon name="plus" size={26} color={isDark ? colors.lavender : c.violet} />
        </View>
      </View>
      {createElement(NativeText, { numberOfLines: 1, maxFontSizeMultiplier: 1.2, style: [styles.name, styles.addLabel] }, "Add")}
    </Touch>
  );
}

function MoreBubble({ count }: { count: number }) {
  const styles = useStyles();
  return (
    <Touch
      onPress={() => router.push(peopleHref)}
      pressedScale={0.94}
      haptic
      accessibilityRole="button"
      accessibilityLabel={`${count} more ${count === 1 ? "person" : "people"}. See all`}
      containerStyle={styles.item}
      pressableStyle={styles.itemPressable}
    >
      <View style={styles.bubbleBox}>
        <View style={styles.moreDisc}>
          {createElement(NativeText, { maxFontSizeMultiplier: 1, style: styles.moreCount }, `+${count}`)}
        </View>
      </View>
      {createElement(NativeText, { numberOfLines: 1, maxFontSizeMultiplier: 1.2, style: styles.name }, "See all")}
    </Touch>
  );
}

function OfflinePeopleCard({ onRetry }: { onRetry: () => void }) {
  const { colors: c } = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.card, styles.offlineCard]}>
      <View style={styles.offlineGlyph}>
        <Icon name="alert-circle" size={20} color={c.slate} />
      </View>
      <View style={styles.cardCopy}>
        {createElement(NativeText, { style: styles.cardTitle, maxFontSizeMultiplier: 1.4 }, "People are offline")}
        {createElement(NativeText, { style: styles.cardDetail, maxFontSizeMultiplier: 1.4 }, "They show up once LenaDena reconnects.")}
      </View>
      <Button label="Retry" variant="ghost" size="sm" onPress={onRetry} />
    </View>
  );
}

/** Static placeholders (no looping shimmer) while the plan loads. */
function LoadingBubbles() {
  const styles = useStyles();
  return (
    <View accessible accessibilityLabel="Loading people" style={[styles.scroller, styles.loadingRow]}>
      {[0, 1, 2, 3].map((slot) => (
        <View key={slot} style={[styles.item, styles.itemPressable]}>
          <View style={styles.bubbleBox}>
            <View style={styles.placeholderDisc} />
          </View>
          <View style={styles.placeholderBar} />
        </View>
      ))}
    </View>
  );
}

function EmptyPeopleCard() {
  const styles = useStyles();
  return (
    <View style={[styles.card, styles.emptyCard]}>
      {/* Default surface: Clay dims its pale "paper" tones itself on the dark raised card. */}
      <ClayPeople size={88} accessory="plus" glow={false} />
      <View style={styles.cardCopy}>
        {createElement(NativeText, { style: styles.cardTitle, maxFontSizeMultiplier: 1.4 }, "Keep track of people you lend to or borrow from")}
        {createElement(NativeText, { style: styles.cardDetail, maxFontSizeMultiplier: 1.4 }, "Their balances and history collect in one place.")}
        <View style={styles.emptyAction}>
          <Button label="Add a person" icon="user-plus" onPress={() => router.push(personFormHref())} />
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c, { isDark }) => ({
  header: {
    paddingHorizontal: layout.gutter,
    marginTop: 28,
  },
  scroller: {
    paddingHorizontal: layout.gutter,
    gap: 12,
  },
  loadingRow: {
    flexDirection: "row",
  },
  item: {
    width: ITEM_WIDTH,
  },
  itemPressable: {
    alignItems: "center",
    gap: 7,
    paddingVertical: 2,
  },
  bubbleBox: {
    width: BOX,
    height: BOX,
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    alignSelf: "stretch",
    textAlign: "center",
    fontFamily: "Manrope_600SemiBold",
    fontSize: 12,
    lineHeight: 16,
    color: c.ink,
  },
  // violetStrong keeps small text above 4.5:1 on the pale canvas (theme violet is 4.25:1); lavender on night.
  addLabel: {
    color: isDark ? colors.lavender : colors.violetStrong,
  },
  addDisc: {
    width: DISC,
    height: DISC,
    borderRadius: DISC / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.violetSoft,
  },
  moreDisc: {
    width: DISC,
    height: DISC,
    borderRadius: DISC / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
  },
  moreCount: {
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 16,
    lineHeight: 20,
    color: c.ink,
  },
  placeholderDisc: {
    width: DISC,
    height: DISC,
    borderRadius: DISC / 2,
    backgroundColor: c.surface,
  },
  placeholderBar: {
    width: 40,
    height: 10,
    marginTop: 3,
    borderRadius: 5,
    backgroundColor: c.surface,
  },
  card: {
    marginHorizontal: layout.gutter,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: c.line,
    backgroundColor: c.raised,
  },
  emptyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 16,
    paddingLeft: 10,
    paddingRight: 16,
  },
  offlineCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  offlineGlyph: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.surface,
  },
  cardCopy: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    fontFamily: "Manrope_700Bold",
    fontSize: 15,
    lineHeight: 20,
    color: c.ink,
  },
  cardDetail: {
    marginTop: 3,
    fontFamily: "Manrope_500Medium",
    fontSize: 12.5,
    lineHeight: 17,
    color: c.slate,
  },
  emptyAction: {
    marginTop: 12,
  },
}));
