import { createElement, useMemo, useState } from "react";
import { StyleSheet, Text as NativeText, View } from "react-native";
import { router } from "expo-router";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { BalanceChip } from "@/components/people/BalanceChip";
import { PersonRow } from "@/components/people/PersonRow";
import { FabButton } from "@/components/ui/FabButton";
import { Input } from "@/components/ui/Input";
import { LedgerList } from "@/components/ui/LedgerRow";
import { Screen } from "@/components/ui/Screen";
import { Spinner } from "@/components/ui/Spinner";
import { useLedger } from "@/features/ledger/LedgerProvider";
import { getPlanState } from "@/features/ledger/planState";
import { peopleTotals, searchPeople, sortPeopleForList, type PersonSummary } from "@/features/people/people";
import { addBalanceHref, personFormHref, personHref } from "@/features/people/routes";
import { usePeopleSummaries } from "@/features/people/usePeople";
import { formatMoney } from "@/lib/format";
import { makeStyles } from "@/theme/ThemeProvider";

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/** People: everyone you keep individual balances with, open balances first, with search and a quick add. */
export default function PeopleScreen() {
  const { plan, connection, refresh } = useLedger();
  const styles = useStyles();
  const summaries = usePeopleSummaries();
  const [query, setQuery] = useState("");
  const planState = getPlanState(plan, connection);
  const sorted = useMemo(() => sortPeopleForList(summaries), [summaries]);
  const results = useMemo(() => searchPeople(sorted, query, (summary) => summary.person), [sorted, query]);
  const totals = useMemo(() => peopleTotals(summaries), [summaries]);
  const count = summaries.length;
  const searching = query.trim().length > 0;
  const subtitle = count > 0 ? `${plural(count, "person", "people")} · private to you` : "Private to you";

  let content;
  if (count === 0 && planState === "loading") {
    content = (
      <LedgerList>
        <View style={shape.loading} accessible accessibilityLabel="Loading people">
          <Spinner />
          {createElement(NativeText, { maxFontSizeMultiplier: 1.4, style: styles.loadingLabel }, "Loading people")}
        </View>
      </LedgerList>
    );
  } else if (count === 0 && planState === "offline") {
    content = (
      <LedgerList>
        <EmptyState
          variant="inset"
          icon="alert-circle"
          title="People are offline"
          detail="Your people show up once LenaDena reconnects."
          action={{ label: "Try again", onPress: () => void refresh() }}
        />
      </LedgerList>
    );
  } else if (count === 0) {
    content = (
      <EmptyState
        icon="users"
        illustration="groups"
        title="No people yet"
        detail="Add the friends you lend to or borrow from. Their balances and history collect here, and they're suggested whenever you add a balance."
        action={{ label: "Add a person", icon: "user-plus", onPress: () => router.push(personFormHref()) }}
        secondaryAction={{ label: "Add a balance", icon: "plus", onPress: () => router.push(addBalanceHref()) }}
      />
    );
  } else {
    content = (
      <View style={shape.body}>
        <Totals totals={totals} />
        <View style={shape.toolbar}>
          <View style={shape.search}>
            <Input
              value={query}
              onChangeText={setQuery}
              placeholder="Search by name or email"
              leadingIcon="search"
              {...(searching ? { trailingIcon: "close" as const, onTrailingPress: () => setQuery("") } : {})}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Search people"
            />
          </View>
          <FabButton size={52} tone="violet" icon="user-plus" accessibilityLabel="Add a person" onPress={() => router.push(personFormHref())} />
        </View>
        {searching ? (
          results.length ? (
            <Section title={plural(results.length, "match", "matches")} people={results} />
          ) : (
            <LedgerList>
              <EmptyState
                variant="inset"
                icon="search"
                title={`No one matches “${query.trim()}”`}
                detail="Check the spelling, or save them as someone new."
                action={{ label: `Add ${query.trim()}`, icon: "user-plus", onPress: () => router.push(personFormHref({ name: query })) }}
              />
            </LedgerList>
          )
        ) : (
          <People sorted={sorted} />
        )}
      </View>
    );
  }

  return (
    <Screen>
      <PageHeader title="People" subtitle={subtitle} />
      {content}
    </Screen>
  );
}

/** Open balances first, then everyone else, each in its own list. */
function People({ sorted }: { sorted: PersonSummary[] }) {
  const open = sorted.filter((summary) => summary.openCount > 0);
  const rest = sorted.filter((summary) => summary.openCount === 0);
  return (
    <View style={shape.sections}>
      {open.length ? <Section title="Open balances" people={open} /> : null}
      {rest.length ? <Section title={open.length ? "Everyone else" : "Everyone"} people={rest} /> : null}
    </View>
  );
}

function Section({ title, people }: { title: string; people: PersonSummary[] }) {
  const styles = useStyles();
  return (
    <View>
      <View style={shape.sectionHeader}>
        {createElement(NativeText, { accessibilityRole: "header", numberOfLines: 1, style: styles.sectionTitle }, title)}
        {createElement(NativeText, { numberOfLines: 1, style: styles.sectionCount }, String(people.length))}
      </View>
      <LedgerList>
        {people.map((summary, index) => (
          <PersonRow key={summary.person.id} summary={summary} divider={index > 0} onPress={() => router.push(personHref(summary.person.id))} />
        ))}
      </LedgerList>
    </View>
  );
}

/** What everyone owes you and what you owe, per currency (each person counted by their net). */
function Totals({ totals }: { totals: ReturnType<typeof peopleTotals> }) {
  const chips = totals.flatMap((total) => [
    ...(total.owedMinor > 0 ? [{ key: `${total.currency}-owed`, label: "Owed to you", value: formatMoney(total.owedMinor, total.currency), tone: "positive" as const }] : []),
    ...(total.oweMinor > 0 ? [{ key: `${total.currency}-owe`, label: "You owe", value: formatMoney(total.oweMinor, total.currency), tone: "negative" as const }] : []),
  ]);
  return (
    <View style={shape.totals}>
      {chips.length ? (
        chips.map((chip) => (
          <View key={chip.key} style={shape.total}>
            <BalanceChip label={chip.label} value={chip.value} tone={chip.tone} />
          </View>
        ))
      ) : (
        <View style={shape.total}>
          <BalanceChip label="Balances" value="All settled" tone="neutral" icon="check-circle" />
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  loadingLabel: {
    marginTop: 10,
    fontFamily: "Manrope_600SemiBold",
    fontSize: 13,
    lineHeight: 18,
    color: c.slate,
  },
  sectionTitle: {
    flexShrink: 1,
    fontFamily: "Manrope_700Bold",
    fontSize: 13,
    lineHeight: 18,
    color: c.ink,
  },
  sectionCount: {
    fontFamily: "Manrope_600SemiBold",
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.8,
    color: c.slate,
  },
}));

const shape = StyleSheet.create({
  body: {
    gap: 18,
  },
  totals: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  // Two chips share the row evenly; more currencies wrap onto new rows.
  total: {
    flexGrow: 1,
    flexBasis: 150,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  search: {
    flex: 1,
    minWidth: 0,
  },
  sections: {
    gap: 20,
  },
  sectionHeader: {
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
