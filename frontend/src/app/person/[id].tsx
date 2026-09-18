import { createElement, useMemo, useState } from "react";
import { StyleSheet, Text as NativeText, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { BalanceChip } from "@/components/people/BalanceChip";
import { PersonAvatar } from "@/components/people/PersonAvatar";
import { PersonHeroCard } from "@/components/people/PersonHeroCard";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { EntryTile } from "@/components/ui/EntryTile";
import { Icon } from "@/components/ui/Icon";
import { LedgerList, LedgerRow } from "@/components/ui/LedgerRow";
import { Screen } from "@/components/ui/Screen";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { useLedger } from "@/features/ledger/LedgerProvider";
import { getPlanState } from "@/features/ledger/planState";
import type { TransactionItem } from "@/features/ledger/types";
import {
  balanceStatement,
  describePersonEntry,
  groupEntriesByMonth,
  indexPersonEntries,
  personFirstName,
  summarizePerson,
  type PersonSummary,
} from "@/features/people/people";
import { addBalanceHref, peopleHref, personFormHref } from "@/features/people/routes";
import { errorMessage } from "@/lib/api";
import { dateToIso, formatDayMonth, formatLongDate, formatMoney, formatMonth, todayDate } from "@/lib/format";
import { makeStyles } from "@/theme/ThemeProvider";
import { colors } from "@/theme/tokens";

const NO_ENTRIES: readonly TransactionItem[] = [];

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/** A person's page: who they are, where you stand (in plain words), and every entry with them by month. */
export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { plan, connection, refresh, settlePersonalTransaction } = useLedger();
  const toast = useToast();
  const styles = useStyles();
  const [settleTarget, setSettleTarget] = useState<TransactionItem | null>(null);
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const planState = getPlanState(plan, connection);
  const person = plan.people.find((item) => item.id === id);
  const { people, transactions } = plan;
  const entries = useMemo(
    () => (person ? indexPersonEntries(people, transactions).get(person.id) ?? NO_ENTRIES : NO_ENTRIES),
    [people, person, transactions],
  );
  const summary = useMemo(() => (person ? summarizePerson(person, entries) : null), [entries, person]);
  const months = useMemo(() => groupEntriesByMonth(entries), [entries]);
  const today = todayDate();

  if (!person || !summary) {
    const loading = planState === "loading";
    const offline = planState === "offline";
    return (
      <Screen>
        <PageHeader title="Person" />
        {loading ? (
          <LedgerList>
            <View style={shape.loading} accessible accessibilityLabel="Loading this person">
              <Spinner />
              {createElement(NativeText, { maxFontSizeMultiplier: 1.4, style: styles.loadingLabel }, "Loading")}
            </View>
          </LedgerList>
        ) : offline ? (
          <LedgerList>
            <EmptyState
              variant="inset"
              icon="alert-circle"
              title="Couldn't load this person"
              detail="Their balance and history show up once LenaDena reconnects."
              action={{ label: "Try again", onPress: () => void refresh() }}
            />
          </LedgerList>
        ) : (
          <EmptyState
            icon="user"
            illustration="groups"
            title="Not in your people"
            detail="They may have been removed. Entries with them stay in Activity."
            action={{ label: "See people", icon: "users", onPress: () => router.replace(peopleHref) }}
          />
        )}
      </Screen>
    );
  }

  const first = personFirstName(person.name);
  const added = person.createdAt ? /^\d{4}-\d{2}-\d{2}/.exec(person.createdAt)?.[0] : undefined;

  const settle = () => {
    const item = settleTarget;
    if (!item) return;
    setSettlingId(item.id);
    void settlePersonalTransaction(item.id)
      .then(() => {
        setSettleTarget(null);
        toast.success("Marked as settled", `${item.title} left your open balance with ${first} and stays in their history.`);
      })
      .catch((error: unknown) => toast.error("Couldn't settle the entry", errorMessage(error)))
      .finally(() => setSettlingId(null));
  };

  return (
    <Screen>
      <PageHeader title="Person" subtitle={added ? `Added ${formatLongDate(added)} · private to you` : "Private to you"} />
      <Hero summary={summary} />

      <View style={shape.history}>
        <SectionHeader
          title="History"
          detail={summary.entryCount ? `${plural(summary.entryCount, "entry", "entries")} · ${summary.openCount} open` : `Everything with ${first} collects here`}
        />
        {summary.entryCount === 0 ? (
          <LedgerList>
            <EmptyState
              variant="inset"
              icon="file-text"
              title="No entries yet"
              detail={`Add what you lent ${first} or borrowed from them. It shows up here and in Activity.`}
              action={{ label: "Add balance", icon: "plus", onPress: () => router.push(addBalanceHref(person.id)) }}
            />
          </LedgerList>
        ) : (
          <View style={shape.months}>
            {months.map((month) => (
              <View key={month.month || "undated"}>
                <View style={shape.monthHeader}>
                  {createElement(NativeText, { accessibilityRole: "header", numberOfLines: 1, style: styles.monthLabel }, month.month ? formatMonth(month.month, "long", true) : "Undated")}
                  {createElement(NativeText, { numberOfLines: 1, style: styles.monthCount }, plural(month.items.length, "entry", "entries"))}
                </View>
                <EntryList items={month.items} today={today} settlingId={settlingId} onSettle={setSettleTarget} />
              </View>
            ))}
          </View>
        )}
      </View>

      <ConfirmModal
        visible={Boolean(settleTarget)}
        title="Mark this as settled?"
        detail={settleTarget ? `${settleTarget.title} will leave your open balance with ${first} and stay visible in their history and Activity.` : ""}
        confirmLabel="Mark settled"
        cancelLabel="Keep open"
        loading={Boolean(settlingId)}
        onConfirm={settle}
        onClose={() => setSettleTarget(null)}
      />
    </Screen>
  );
}

function EntryList({ items, today, settlingId, onSettle }: { items: TransactionItem[]; today: string; settlingId: string | null; onSettle: (item: TransactionItem) => void }) {
  return (
    <LedgerList>
      {items.map((item, index) => {
        const copy = describePersonEntry(item, today);
        return (
          <LedgerRow
            key={item.id}
            leading={<EntryTile icon={copy.tile.icon} tone={copy.tile.tone} {...(copy.tile.badge ? { badge: copy.tile.badge } : {})} />}
            title={copy.title}
            subtitle={copy.subtitle}
            {...(item.note?.trim() ? { note: item.note.trim() } : {})}
            amount={copy.amount}
            status={copy.status}
            divider={index > 0}
            accessibilityLabel={copy.accessibilityLabel}
            footer={copy.canSettle ? (
              <Button
                label="Mark settled"
                icon="check"
                size="md"
                variant="secondary"
                loading={settlingId === item.id}
                onPress={() => onSettle(item)}
                accessibilityHint={`Marks ${copy.title} as settled after you confirm`}
              />
            ) : undefined}
          />
        );
      })}
    </LedgerList>
  );
}

/** The contact card: photo or initials with the status ring, name, email, the balance in words, and actions. */
function Hero({ summary }: { summary: PersonSummary }) {
  const styles = useStyles();
  const { person } = summary;
  const statement = balanceStatement(summary);
  // The largest amount leads; with several currencies the chips below break every one down.
  const lead = statement.amounts[0];
  const amountColor = statement.tone === "positive" ? colors.mintBright : statement.tone === "negative" ? colors.coralBright : colors.white;
  const status = summary.standing === "owed" || summary.standing === "owe" || summary.standing === "mixed" ? summary.standing : "none";
  const leaning = summary.balances.filter((balance) => balance.netMinor !== 0);
  const lastActivity = summary.lastActivityMs !== undefined ? formatDayMonth(dateToIso(new Date(summary.lastActivityMs))) : null;
  const meta = [
    summary.openCount ? plural(summary.openCount, "open entry", "open entries") : null,
    lastActivity ? `last activity ${lastActivity}` : null,
  ].filter(Boolean).join(" · ");
  const email = person.email?.trim();

  return (
    <PersonHeroCard>
      <View style={shape.identity}>
        <PersonAvatar name={person.name} uri={person.avatarUrl} size={88} status={status} ringTone="bright" />
        {createElement(NativeText, { accessibilityRole: "header", numberOfLines: 2, style: styles.name }, person.name)}
        <View style={shape.emailRow}>
          <Icon name={email ? "mail" : "at"} size={14} color="rgba(255,255,255,0.6)" />
          {createElement(NativeText, { numberOfLines: 1, style: [styles.email, !email && styles.emailMissing] }, email || "No email")}
        </View>
      </View>

      <View style={styles.divider} />

      <View style={shape.statement} accessible accessibilityLabel={`${statement.sentence}.${meta ? ` ${meta}.` : ""}`}>
        {createElement(NativeText, { style: styles.headline }, statement.headline)}
        {lead ? (
          createElement(NativeText, { numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.6, style: [styles.amount, { color: amountColor }] }, lead)
        ) : summary.standing === "settled" || summary.standing === "even" ? (
          <View style={styles.settledMark}>
            <Icon name="check" size={22} color={colors.mintBright} />
          </View>
        ) : null}
        {meta ? createElement(NativeText, { style: styles.meta }, meta) : null}
      </View>

      {leaning.length > 1 ? (
        <View style={shape.breakdown}>
          {leaning.map((balance) => (
            <BalanceChip
              key={balance.currency}
              appearance="hero"
              label={`${balance.currency} · ${balance.netMinor > 0 ? "Owes you" : "You owe"}`}
              value={formatMoney(Math.abs(balance.netMinor), balance.currency)}
              tone={balance.netMinor > 0 ? "positive" : "negative"}
            />
          ))}
        </View>
      ) : null}

      <View style={shape.actions}>
        <View style={shape.action}>
          <Button label="Add balance" icon="plus" variant="bright" fullWidth onPress={() => router.push(addBalanceHref(person.id))} />
        </View>
        <View style={shape.action}>
          <Button label="Edit" icon="edit" variant="glass" fullWidth onPress={() => router.push(personFormHref({ id: person.id }))} />
        </View>
      </View>
    </PersonHeroCard>
  );
}

// Hero text sits on the always-dark violet card, so it uses fixed white and bright tints in both themes.
const useStyles = makeStyles((c) => ({
  name: {
    marginTop: 14,
    textAlign: "center",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.4,
    color: colors.white,
  },
  email: {
    flexShrink: 1,
    fontFamily: "Manrope_500Medium",
    fontSize: 13,
    lineHeight: 18,
    color: "rgba(255,255,255,0.72)",
  },
  emailMissing: {
    color: "rgba(255,255,255,0.5)",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 18,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  headline: {
    textAlign: "center",
    fontFamily: "Manrope_700Bold",
    fontSize: 16,
    lineHeight: 22,
    color: "rgba(255,255,255,0.86)",
  },
  amount: {
    marginTop: 2,
    textAlign: "center",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 36,
    lineHeight: 44,
    letterSpacing: -0.8,
  },
  settledMark: {
    marginTop: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(111,224,184,0.16)",
  },
  meta: {
    marginTop: 6,
    textAlign: "center",
    fontFamily: "Manrope_500Medium",
    fontSize: 12,
    lineHeight: 16,
    color: "rgba(255,255,255,0.62)",
  },
  loadingLabel: {
    marginTop: 10,
    fontFamily: "Manrope_600SemiBold",
    fontSize: 13,
    lineHeight: 18,
    color: c.slate,
  },
  monthLabel: {
    flexShrink: 1,
    fontFamily: "Manrope_700Bold",
    fontSize: 13,
    lineHeight: 18,
    color: c.ink,
  },
  monthCount: {
    fontFamily: "Manrope_600SemiBold",
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: c.slate,
  },
}));

const shape = StyleSheet.create({
  identity: {
    alignItems: "center",
    paddingTop: 4,
  },
  emailRow: {
    marginTop: 4,
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statement: {
    alignItems: "center",
  },
  breakdown: {
    marginTop: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  actions: {
    marginTop: 20,
    flexDirection: "row",
    gap: 10,
  },
  action: {
    flex: 1,
  },
  history: {
    marginTop: 30,
  },
  months: {
    gap: 18,
  },
  monthHeader: {
    marginBottom: 8,
    paddingHorizontal: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  loading: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
  },
});
