import { createElement, useEffect, useMemo, useRef, useState } from "react";
import type { TextInput } from "react-native";
import { ScrollView, StyleSheet, Text as NativeText, View } from "react-native";
import Animated, { FadeIn, useReducedMotion } from "react-native-reanimated";
import { NewPersonChip, PersonChip } from "@/components/people/PersonChip";
import { PersonAvatar } from "@/components/people/PersonAvatar";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { Touch } from "@/components/ui/Touch";
import {
  findPersonByName,
  searchPeople,
  shortNames,
  sortPeopleByRecentUse,
  standingLine,
  type PersonSummary,
} from "@/features/people/people";
import type { Person } from "@/features/ledger/types";
import { makeStyles, useTheme } from "@/theme/ThemeProvider";
import { colors } from "@/theme/tokens";

const MAX_SUGGESTIONS = 5;
/** Keeps the dropdown up for a beat after the field blurs, so a tap on a suggestion still lands (web). */
const BLUR_GRACE_MS = 160;

export type PersonPickerProps = {
  /** The typed or chosen name. A value that matches a saved person (ignoring case) is linked to them. */
  value: string;
  onChange: (value: string) => void;
  summaries: readonly PersonSummary[];
  /** Shown first in the chip row (the person the screen was opened for). */
  pinnedId?: string;
  invalid?: boolean;
};

/**
 * Who a balance is with: the name field, then a row of saved people (most recently used first, the chosen one
 * solid violet with a check) and a "+ New" chip. While you type, the row gives way to a dropdown of matches right
 * under the field, so nothing above the field moves and the matches sit just above the keyboard. Typing a saved
 * name links it; a new name gets a quiet "will be added to your people" line.
 */
export function PersonPicker({ value, onChange, summaries, pinnedId, invalid = false }: PersonPickerProps) {
  const { colors: c, isDark } = useTheme();
  const styles = useStyles();
  const reduceMotion = useReducedMotion();
  const inputRef = useRef<TextInput>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => () => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
  }, []);

  const recent = useMemo(() => {
    const sorted = sortPeopleByRecentUse(summaries);
    const pinned = pinnedId ? sorted.find((summary) => summary.person.id === pinnedId) : undefined;
    return pinned ? [pinned, ...sorted.filter((summary) => summary !== pinned)] : sorted;
  }, [pinnedId, summaries]);
  const people = useMemo(() => recent.map((summary) => summary.person), [recent]);
  const labels = useMemo(() => shortNames(people), [people]);
  const query = value.trim();
  const linked = findPersonByName(people, query);
  const linkedSummary = linked ? recent.find((summary) => summary.person.id === linked.id) : undefined;
  const suggestions = useMemo(
    () => (query ? searchPeople(recent, query, (summary) => summary.person).filter((summary) => summary.person.id !== linked?.id).slice(0, MAX_SUGGESTIONS) : []),
    [linked?.id, query, recent],
  );
  const typing = focused && query.length > 0;

  const choose = (person: Person) => {
    onChange(person.name);
    inputRef.current?.blur();
    setFocused(false);
  };

  const toggleChip = (person: Person) => {
    if (linked?.id === person.id) {
      onChange("");
      return;
    }
    choose(person);
  };

  const startNew = () => {
    onChange("");
    inputRef.current?.focus();
  };

  const chips = recent.length ? (
    <ScrollView
      horizontal
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
      style={shape.chipScroller}
      contentContainerStyle={shape.chips}
      accessibilityRole="radiogroup"
      accessibilityLabel="Your people"
    >
      <NewPersonChip onPress={startNew} active={focused && !linked} />
      {recent.map((summary) => (
        <PersonChip
          key={summary.person.id}
          name={summary.person.name}
          label={labels.get(summary.person.id) ?? summary.person.name}
          uri={summary.person.avatarUrl}
          selected={linked?.id === summary.person.id}
          onPress={() => toggleChip(summary.person)}
          accessibilityLabel={`${summary.person.name}. ${standingLine(summary)}`}
        />
      ))}
    </ScrollView>
  ) : null;

  const dropdown = suggestions.length
    ? createElement(
      Animated.View,
      {
        entering: reduceMotion ? undefined : FadeIn.duration(140),
        style: styles.dropdown,
        accessibilityLabel: "Suggestions",
      },
      suggestions.map((summary, index) => (
        <Suggestion key={summary.person.id} summary={summary} query={query} divider={index > 0} onPress={() => choose(summary.person)} />
      )),
    )
    : null;

  return (
    <View>
      <Input
        ref={inputRef}
        value={value}
        onChangeText={onChange}
        placeholder={recent.length ? "Type a name, or pick below" : "Person's name"}
        leadingIcon="user"
        {...(value ? { trailingIcon: "close" as const, onTrailingPress: startNew } : {})}
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="done"
        invalid={invalid}
        accessibilityLabel="Person's name"
        onFocus={() => {
          if (blurTimer.current) clearTimeout(blurTimer.current);
          setFocused(true);
        }}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setFocused(false), BLUR_GRACE_MS);
        }}
      />

      {typing ? dropdown : chips}

      {linked ? (
        <View style={shape.note} accessible accessibilityLabel={`${linked.name} from your people. ${linkedSummary ? standingLine(linkedSummary) : ""}`}>
          <Icon name="check-circle" size={15} color={c.mint} />
          {createElement(
            NativeText,
            { style: styles.noteText, numberOfLines: 2 },
            createElement(NativeText, { style: styles.noteStrong }, linked.name),
            ` from your people${linkedSummary ? ` · ${standingLine(linkedSummary)}` : ""}`,
          )}
        </View>
      ) : query ? (
        <View style={shape.note} accessible accessibilityLabel={`${query} will be added to your people`}>
          <Icon name="user-plus" size={15} color={isDark ? colors.lavender : c.violet} />
          {createElement(
            NativeText,
            { style: styles.noteText, numberOfLines: 2 },
            createElement(NativeText, { style: styles.noteStrong }, `“${query}”`),
            " will be added to your people",
          )}
        </View>
      ) : null}
    </View>
  );
}

function Suggestion({ summary, query, divider, onPress }: { summary: PersonSummary; query: string; divider: boolean; onPress: () => void }) {
  const { colors: c } = useTheme();
  const styles = useStyles();
  const { person } = summary;
  // Bold the typed part when it appears as-is in the name (accent-insensitive matches just stay plain).
  const start = person.name.toLowerCase().indexOf(query.toLowerCase());
  const name = start >= 0
    ? [
      person.name.slice(0, start),
      createElement(NativeText, { key: "match", style: styles.match }, person.name.slice(start, start + query.length)),
      person.name.slice(start + query.length),
    ]
    : [person.name];
  return (
    <Touch
      onPress={onPress}
      pressedScale={0.985}
      accessibilityRole="button"
      accessibilityLabel={`${person.name}. ${standingLine(summary)}`}
      accessibilityHint="Uses this person for the balance"
    >
      <View style={[shape.suggestion, divider && styles.suggestionDivider]}>
        <PersonAvatar name={person.name} uri={person.avatarUrl} size={34} />
        <View style={shape.suggestionCopy}>
          {createElement(NativeText, { numberOfLines: 1, style: styles.suggestionName }, ...name)}
          {createElement(NativeText, { numberOfLines: 1, style: styles.suggestionDetail }, standingLine(summary))}
        </View>
        <Icon name="chevron-right" size={16} color={c.slate} />
      </View>
    </Touch>
  );
}

const useStyles = makeStyles((c, { isDark }) => ({
  // A menu lifted off the form card: raised + shadow on light; on dark (no shadows) one step lighter, surface.
  dropdown: {
    marginTop: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: c.line,
    backgroundColor: isDark ? c.surface : c.raised,
    shadowColor: c.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: isDark ? 0 : 0.1,
    shadowRadius: 18,
    elevation: isDark ? 0 : 4,
  },
  suggestionDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.line,
  },
  suggestionName: {
    fontFamily: "Manrope_600SemiBold",
    fontSize: 15,
    lineHeight: 20,
    color: c.ink,
  },
  match: {
    fontFamily: "Manrope_800ExtraBold",
    color: isDark ? colors.lavender : colors.violetStrong,
  },
  suggestionDetail: {
    marginTop: 1,
    fontFamily: "Manrope_500Medium",
    fontSize: 12,
    lineHeight: 16,
    color: c.slate,
  },
  noteText: {
    flexShrink: 1,
    fontFamily: "Manrope_500Medium",
    fontSize: 12.5,
    lineHeight: 17,
    color: c.slate,
  },
  noteStrong: {
    fontFamily: "Manrope_700Bold",
    color: c.ink,
  },
}));

const shape = StyleSheet.create({
  // The chip row bleeds to the card's edges (its 16pt padding) so chips scroll under the rounded edge.
  chipScroller: {
    marginHorizontal: -16,
    marginTop: 12,
  },
  chips: {
    paddingHorizontal: 16,
    gap: 8,
  },
  suggestion: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  suggestionCopy: {
    flex: 1,
    minWidth: 0,
  },
  note: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 4,
  },
});
