import { createElement, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text as NativeText, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { Easing, FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import {
  addMonths,
  canShiftMonth,
  clampDay,
  clampMonth,
  compareMonths,
  dayAccessibilityLabel,
  formatHeaderDate,
  formatMonthTitle,
  formatSpokenDate,
  isDayDisabled,
  isMonthDisabled,
  isSameDay,
  isSameMonth,
  isYearDisabled,
  monthLabels,
  monthMatrix,
  monthOf,
  quickDates,
  toLocalDay,
  weekdayLabels,
  type DateBounds,
  type YearMonth,
} from "@/lib/calendar";
import { makeStyles, useTheme } from "@/theme/ThemeProvider";
import { colors } from "@/theme/tokens";

export type DatePickerSheetProps = {
  visible: boolean;
  /** The current value; the picker opens on it (clamped into the bounds). */
  value: Date;
  /** "Use this date". Returns a local-noon date, safe for `dateToIso`. */
  onConfirm: (value: Date) => void;
  /** Cancel, drag down, scrim tap or Android back. */
  onClose: () => void;
  minimumDate?: Date | undefined;
  maximumDate?: Date | undefined;
  title?: string | undefined;
};

const CELL = 44;
const DOT = 40;
const SWIPE_DISTANCE = 56;
const SWIPE_VELOCITY = 600;
const SLIDE = 36;
const SLIDE_IN = { duration: 220, easing: Easing.out(Easing.cubic) };

/** The app's own date picker: a themed BottomSheet with a month grid, month/year chooser and quick chips. */
export function DatePickerSheet({ visible, value, onConfirm, onClose, minimumDate, maximumDate, title = "Choose date" }: DatePickerSheetProps) {
  const styles = useStyles();
  const { colors: c, isDark } = useTheme();
  const reduceMotion = useReducedMotion();
  const bounds = useMemo<DateBounds>(() => ({ minimumDate, maximumDate }), [minimumDate, maximumDate]);

  const [today, setToday] = useState(() => toLocalDay(new Date()));
  const [draft, setDraft] = useState(() => clampDay(value, bounds));
  const [view, setView] = useState<YearMonth>(() => monthOf(clampDay(value, bounds)));
  const [mode, setMode] = useState<"days" | "months">("days");
  const [yearCursor, setYearCursor] = useState(() => clampDay(value, bounds).getFullYear());

  // Every opening starts from the current value, today and the day grid.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      const now = toLocalDay(new Date());
      const start = clampDay(value, bounds, now);
      setToday(now);
      setDraft(start);
      setView(monthOf(start));
      setYearCursor(start.getFullYear());
      setMode("days");
    }
  }

  // --- month paging ----------------------------------------------------------------------------------------------

  const slide = useSharedValue(0);
  const gridOpacity = useSharedValue(1);
  const canPrev = useSharedValue(true);
  const canNext = useSharedValue(true);
  const viewRef = useRef(view);
  viewRef.current = view;

  const prevAllowed = canShiftMonth(view, -1, bounds);
  const nextAllowed = canShiftMonth(view, 1, bounds);
  useEffect(() => {
    canPrev.value = prevAllowed;
    canNext.value = nextAllowed;
  }, [canNext, canPrev, nextAllowed, prevAllowed]);

  /** Slides the calendar content in from the side it is coming from (a short fade with reduced motion). */
  const playEnter = useCallback((direction: number) => {
    if (reduceMotion) {
      slide.value = 0;
      gridOpacity.value = 0.35;
      gridOpacity.value = withTiming(1, { duration: 140 });
      return;
    }
    slide.value = direction * SLIDE;
    gridOpacity.value = 0;
    slide.value = withTiming(0, SLIDE_IN);
    gridOpacity.value = withTiming(1, { duration: 200 });
  }, [gridOpacity, reduceMotion, slide]);

  const goToMonth = useCallback((next: YearMonth) => {
    const target = clampMonth(next, bounds);
    const direction = compareMonths(target, viewRef.current);
    if (direction === 0) return;
    setView(target);
    playEnter(direction);
  }, [bounds, playEnter]);

  const shiftMonth = useCallback((step: number) => {
    if (!canShiftMonth(viewRef.current, step, bounds)) return;
    goToMonth(addMonths(viewRef.current, step));
  }, [bounds, goToMonth]);

  const swipe = Gesture.Pan()
    .enabled(mode === "days")
    .activeOffsetX([-12, 12])
    .failOffsetY([-10, 10])
    .onUpdate((event) => {
      const blocked = event.translationX > 0 ? !canPrev.value : !canNext.value;
      slide.value = event.translationX * (blocked ? 0.18 : 0.6);
      gridOpacity.value = 1 - Math.min(Math.abs(event.translationX) / 420, 0.4);
    })
    .onEnd((event) => {
      const step = event.translationX < 0 ? 1 : -1;
      const allowed = step > 0 ? canNext.value : canPrev.value;
      const far = Math.abs(event.translationX) > SWIPE_DISTANCE || Math.abs(event.velocityX) > SWIPE_VELOCITY;
      if (allowed && far && Math.sign(event.velocityX || event.translationX) === -step) {
        scheduleOnRN(shiftMonth, step);
        return;
      }
      slide.value = reduceMotion ? 0 : withSpring(0, { damping: 22, stiffness: 260 });
      gridOpacity.value = withTiming(1, { duration: 140 });
    });

  const gridStyle = useAnimatedStyle(() => ({
    opacity: gridOpacity.value,
    transform: [{ translateX: slide.value }],
  }));

  // --- selection -------------------------------------------------------------------------------------------------

  const select = useCallback((date: Date) => {
    if (isDayDisabled(date, bounds)) return;
    setDraft(date);
    if (!isSameMonth(monthOf(date), viewRef.current)) goToMonth(monthOf(date));
  }, [bounds, goToMonth]);

  const selectFromGrid = useCallback((date: Date) => {
    void Haptics.selectionAsync().catch(() => undefined);
    select(date);
  }, [select]);

  const toggleMode = () => {
    if (mode === "days") {
      setYearCursor(view.year);
      setMode("months");
    } else {
      setMode("days");
    }
    playEnter(0);
  };

  const chooseMonth = (month: number) => {
    void Haptics.selectionAsync().catch(() => undefined);
    setMode("days");
    const target = clampMonth({ year: yearCursor, month }, bounds);
    if (isSameMonth(target, viewRef.current)) playEnter(0);
    else goToMonth(target);
  };

  const stepYear = (step: number) => {
    const next = yearCursor + step;
    if (isYearDisabled(next, bounds)) return;
    setYearCursor(next);
    playEnter(step);
  };

  // --- labels ----------------------------------------------------------------------------------------------------

  const header = formatHeaderDate(draft);
  const spoken = formatSpokenDate(draft);
  const weekdays = useMemo(() => ({ short: weekdayLabels("short"), long: weekdayLabels("long") }), []);
  const months = useMemo(() => ({ short: monthLabels("short"), long: monthLabels("long") }), []);
  const rows = useMemo(() => monthMatrix(view), [view]);
  const quick = quickDates(today, bounds);
  const accent = isDark ? colors.lavender : c.violet;
  const inDays = mode === "days";
  const titleText = inDays ? formatMonthTitle(view) : String(yearCursor);
  const prevDisabled = inDays ? !prevAllowed : isYearDisabled(yearCursor - 1, bounds);
  const nextDisabled = inDays ? !nextAllowed : isYearDisabled(yearCursor + 1, bounds);

  const navButton = (direction: -1 | 1) => {
    const disabled = direction < 0 ? prevDisabled : nextDisabled;
    const label = inDays
      ? direction < 0 ? "Previous month" : "Next month"
      : direction < 0 ? "Previous year" : "Next year";
    return createElement(
      Pressable,
      {
        key: direction,
        onPress: () => (inDays ? shiftMonth(direction) : stepYear(direction)),
        disabled,
        hitSlop: 4,
        accessibilityRole: "button",
        accessibilityLabel: label,
        accessibilityState: { disabled },
        style: ({ pressed }: { pressed: boolean }) => [styles.navButton, pressed && styles.navPressed, disabled && styles.disabled],
      },
      <Icon name={direction < 0 ? "chevron-left" : "chevron-right"} size={20} color={c.ink} />,
    );
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={title}
      bodyContentStyle={styles.body}
      header={
        <View accessible accessibilityRole="header" accessibilityLabel={`${title}, ${spoken}`}>
          <NativeText maxFontSizeMultiplier={1.3} style={styles.eyebrow}>{title}</NativeText>
          {createElement(
            Animated.View,
            { key: header.label + header.year, entering: reduceMotion ? undefined : FadeIn.duration(160) },
            <NativeText maxFontSizeMultiplier={1.3} style={[styles.year, { color: accent }]}>{header.year}</NativeText>,
            <NativeText maxFontSizeMultiplier={1.2} numberOfLines={1} adjustsFontSizeToFit style={styles.bigDate}>{header.label}</NativeText>,
          )}
        </View>
      }
      footer={
        <View style={styles.footer}>
          <Button label="Cancel" variant="ghost" onPress={onClose} />
          <View style={styles.confirm}>
            <Button label="Use this date" icon="check" fullWidth onPress={() => onConfirm(draft)} accessibilityHint={`Sets ${title.toLowerCase()} to ${spoken}`} />
          </View>
        </View>
      }
    >
      {quick.length ? (
        <View style={styles.chips}>
          {quick.map((item) => {
            const chosen = isSameDay(item.date, draft);
            return (
              <Button
                key={item.key}
                label={item.label}
                size="sm"
                variant={chosen ? "primary" : "secondary"}
                selected={chosen}
                {...(chosen ? { icon: "check" as const } : {})}
                onPress={() => select(item.date)}
              />
            );
          })}
        </View>
      ) : null}

      <View style={styles.navRow}>
        {createElement(
          Pressable,
          {
            onPress: toggleMode,
            hitSlop: 6,
            accessibilityRole: "button",
            accessibilityLabel: inDays ? `${titleText}. Choose month and year` : `${titleText}. Back to days`,
            accessibilityState: { expanded: !inDays },
            style: ({ pressed }: { pressed: boolean }) => [styles.monthTitle, pressed && styles.navPressed],
          },
          <NativeText maxFontSizeMultiplier={1.3} numberOfLines={1} style={styles.monthTitleText}>{titleText}</NativeText>,
          <Icon name={inDays ? "chevron-down" : "chevron-up"} size={16} color={accent} />,
        )}
        <View style={styles.navButtons}>
          {navButton(-1)}
          {navButton(1)}
        </View>
      </View>

      <GestureDetector gesture={swipe}>
        <View collapsable={false} style={styles.calendar}>
          {createElement(
            Animated.View,
            { style: gridStyle },
            inDays ? (
              <View>
                <View style={styles.weekdays} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                  {weekdays.short.map((label, index) => (
                    <NativeText key={weekdays.long[index]} maxFontSizeMultiplier={1.2} numberOfLines={1} style={styles.weekday}>{label}</NativeText>
                  ))}
                </View>
                {rows.map((row) => (
                  <View key={row[0]!.date.getTime()} style={styles.week}>
                    {row.map((cell) => (
                      <DayCell
                        key={cell.date.getTime()}
                        date={cell.date}
                        inMonth={cell.inMonth}
                        selected={isSameDay(cell.date, draft)}
                        today={isSameDay(cell.date, today)}
                        disabled={isDayDisabled(cell.date, bounds)}
                        onSelect={selectFromGrid}
                      />
                    ))}
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.monthGrid}>
                {months.short.map((label, month) => {
                  const target = { year: yearCursor, month };
                  const chosen = isSameMonth(target, view);
                  const current = isSameMonth(target, monthOf(today));
                  const disabled = isMonthDisabled(target, bounds);
                  return createElement(
                    Pressable,
                    {
                      key: label + month,
                      onPress: () => chooseMonth(month),
                      disabled,
                      accessibilityRole: "button",
                      accessibilityLabel: `${months.long[month]} ${yearCursor}${chosen ? ", shown" : ""}${current ? ", this month" : ""}`,
                      accessibilityState: { selected: chosen, disabled },
                      style: ({ pressed }: { pressed: boolean }) => [
                        styles.monthCell,
                        current && !chosen && { borderColor: accent },
                        chosen && styles.monthCellChosen,
                        pressed && !chosen && styles.navPressed,
                        disabled && styles.disabled,
                      ],
                    },
                    <NativeText maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.monthText, current && { color: accent }, chosen && styles.onViolet]}>{label}</NativeText>,
                  );
                })}
              </View>
            ),
          )}
        </View>
      </GestureDetector>
    </BottomSheet>
  );
}

type DayCellProps = {
  date: Date;
  inMonth: boolean;
  selected: boolean;
  today: boolean;
  disabled: boolean;
  onSelect: (date: Date) => void;
};

/** One 44pt day. Selected = solid violet dot with white bold text; today = violet ring; other months muted. */
const DayCell = memo(function DayCell({ date, inMonth, selected, today, disabled, onSelect }: DayCellProps) {
  const styles = useStyles();
  const { colors: c, isDark } = useTheme();
  const ring = isDark ? colors.lavender : c.violet;
  return createElement(
    Pressable,
    {
      onPress: () => onSelect(date),
      disabled,
      accessibilityRole: "button",
      accessibilityLabel: dayAccessibilityLabel(date, { selected, today, disabled }),
      accessibilityState: { selected, disabled },
      style: styles.cell,
      children: ({ pressed }: { pressed: boolean }) => (
      <View
        style={[
          styles.dot,
          today && !selected && { borderColor: ring },
          pressed && !selected && styles.dotPressed,
          selected && styles.dotSelected,
          disabled && styles.disabled,
        ]}
      >
        <NativeText
          maxFontSizeMultiplier={1.2}
          style={[
            styles.dayText,
            !inMonth && styles.dayOutside,
            today && !selected && { color: ring, fontFamily: "Manrope_800ExtraBold" },
            selected && styles.daySelected,
          ]}
        >
          {date.getDate()}
        </NativeText>
      </View>
      ),
    },
  );
});

const useStyles = makeStyles((c, { isDark }) => ({
  eyebrow: {
    fontFamily: "Manrope_600SemiBold",
    fontSize: 13,
    lineHeight: 18,
    color: c.slate,
  },
  year: {
    marginTop: 6,
    fontFamily: "Manrope_700Bold",
    fontSize: 15,
    lineHeight: 20,
  },
  bigDate: {
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -0.8,
    color: c.ink,
  },
  body: {
    paddingTop: 14,
    paddingBottom: 12,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 6,
  },
  monthTitle: {
    minHeight: 44,
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    marginLeft: -8,
    borderRadius: 14,
  },
  monthTitleText: {
    flexShrink: 1,
    fontFamily: "Manrope_700Bold",
    fontSize: 17,
    lineHeight: 22,
    color: c.ink,
  },
  navButtons: {
    flexDirection: "row",
    gap: 8,
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.surface,
    // Dark: the surface sits close to the sheet, so a hairline keeps the button's edge.
    borderWidth: isDark ? 1 : 0,
    borderColor: c.line,
  },
  navPressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.32,
  },
  calendar: {
    // Weekday row + six weeks, shared with the month chooser so the sheet never jumps between modes.
    height: 24 + CELL * 6 + 4,
    overflow: "hidden",
  },
  weekdays: {
    height: 24,
    flexDirection: "row",
    alignItems: "center",
  },
  weekday: {
    flex: 1,
    textAlign: "center",
    fontFamily: "Manrope_600SemiBold",
    fontSize: 12,
    color: c.slate,
  },
  week: {
    flexDirection: "row",
  },
  cell: {
    flex: 1,
    height: CELL,
    minWidth: CELL,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 1.5,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  dotPressed: {
    backgroundColor: c.surface,
  },
  // Static violet: white on it keeps 4.7:1 in both themes.
  dotSelected: {
    backgroundColor: colors.violet,
    borderColor: colors.violet,
  },
  dayText: {
    fontFamily: "Manrope_600SemiBold",
    fontSize: 15,
    color: c.ink,
  },
  dayOutside: {
    color: c.muted,
  },
  daySelected: {
    color: colors.white,
    fontFamily: "Manrope_800ExtraBold",
  },
  monthGrid: {
    height: 24 + CELL * 6,
    flexDirection: "row",
    flexWrap: "wrap",
    alignContent: "space-around",
    rowGap: 10,
  },
  monthCell: {
    width: "31.5%",
    marginHorizontal: "0.9%",
    height: 56,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  monthCellChosen: {
    backgroundColor: colors.violet,
    borderColor: colors.violet,
  },
  monthText: {
    fontFamily: "Manrope_700Bold",
    fontSize: 15,
    color: c.ink,
  },
  onViolet: {
    color: colors.white,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: c.line,
    paddingTop: 14,
  },
  confirm: {
    flex: 1,
  },
}));
