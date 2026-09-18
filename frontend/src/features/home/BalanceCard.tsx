import { createElement, memo, useCallback, useEffect, useId, useRef, useState } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { ScrollView, StyleSheet, Text as NativeText, useWindowDimensions, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming, type SharedValue } from "react-native-reanimated";
import Svg, { Circle, ClipPath, Defs, G, Path, RadialGradient, Stop } from "react-native-svg";
import { ClayCoinStack } from "@/components/brand/Clay";
import { FabButton } from "@/components/ui/FabButton";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Touch } from "@/components/ui/Touch";
import { formatMoney, formatSignedMoney } from "@/lib/format";
import { layout } from "@/theme/layout";
import { makeStyles, useTheme } from "@/theme/ThemeProvider";
import { colors, motion } from "@/theme/tokens";

export type BalancePage = {
  currency: string;
  mode: "ready" | "empty" | "loading" | "offline";
  netMinor: number;
  owedMinor: number;
  oweMinor: number;
  /** Change over the last 7 days. `tracked` is false when the currency has no history at all. */
  change: { changeMinor: number; eventCount: number; tracked: boolean };
};

export type BalancePagerProps = { pages: BalancePage[]; onAddEntry: () => void };

/** Card body height and the page padding around it (§2.23). */
const H = 204;
const PAGE_TOP = 28;
const PAGE_BOTTOM = 30;
const FAB_SIZE = 52;
const CHANGE_DAYS = 7;
/** Lavender hairline around the card where the shell meets the dark canvas (the fake shadow does not read there). */
const DARK_HAIRLINE = "rgba(181,165,255,0.16)";

/** The home entrance plays once per app session; PlanView remounts on every tab switch. */
let homeIntroPlayed = false;
/** Approximate app start. On a cold start the splash covers the home, so the entrance waits for it to finish. */
const MODULE_LOADED_AT = Date.now();

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function bodyPath(W: number) {
  return `M0 32 Q0 8 24 7 L${round(W - 28)} 0.5 Q${round(W)} 0 ${round(W)} 26 L${round(W)} ${H - 30} Q${round(W)} ${H - 2} ${round(W - 28)} ${H - 1} L24 ${H - 7} Q0 ${H - 8} 0 ${H - 32} Z`;
}

function topEdgePath(W: number) {
  return `M0 32 Q0 8 24 7 L${round(W - 28)} 0.5 Q${round(W)} 0 ${round(W)} 26`;
}

type ChipCopy = { icon: IconName; color: string; label: string };

function chipFor(page: BalancePage): ChipCopy | null {
  if (page.mode === "loading" || page.mode === "offline") return null;
  if (page.mode === "empty") return { icon: "sparkles", color: colors.lavender, label: "Nothing tracked yet" };
  const change = page.change.changeMinor;
  if (change > 0) return { icon: "trending-up", color: colors.mintBright, label: `${formatSignedMoney(change, page.currency, "+")} in ${CHANGE_DAYS} days` };
  if (change < 0) return { icon: "trending-down", color: colors.coralBright, label: `${formatSignedMoney(change, page.currency, "-")} in ${CHANGE_DAYS} days` };
  return { icon: "minus", color: colors.lavender, label: `No change in ${CHANGE_DAYS} days` };
}

function captionFor(page: BalancePage) {
  switch (page.mode) {
    case "loading":
      return "Loading your balances";
    case "offline":
      return "Can't reach LenaDena right now";
    case "empty":
      return `No balances yet · ${page.currency}`;
    default:
      return page.netMinor > 0
        ? `Friends owe you overall · ${page.currency}`
        : page.netMinor < 0
          ? `You owe overall · ${page.currency}`
          : `You're all square · ${page.currency}`;
  }
}

function pageLabel(page: BalancePage, index: number, count: number) {
  if (page.mode === "loading") return "Loading your balances.";
  if (page.mode === "offline") return "Can't reach LenaDena right now.";
  const position = count > 1 ? `${page.currency} balance, ${index + 1} of ${count}.` : `${page.currency} balance.`;
  if (page.mode === "empty") return `${position} No balances yet. Tap Add entry to log what you owe or what's owed to you.`;
  const net = formatMoney(Math.abs(page.netMinor), page.currency);
  const headline = page.netMinor > 0 ? `Friends owe you overall ${net}.` : page.netMinor < 0 ? `You owe overall ${net}.` : "You're all square.";
  const change = page.change.changeMinor;
  const trend = change > 0
    ? `Up ${formatMoney(change, page.currency)} in the last ${CHANGE_DAYS} days.`
    : change < 0
      ? `Down ${formatMoney(Math.abs(change), page.currency)} in the last ${CHANGE_DAYS} days.`
      : `No change in the last ${CHANGE_DAYS} days.`;
  return `${position} ${headline} Owed to you ${formatMoney(page.owedMinor, page.currency)}. You owe ${formatMoney(page.oweMinor, page.currency)}. ${trend}`;
}

/** Horizontal pager of per-currency balance cards. Currencies are never summed. */
export function BalancePager({ pages, onAddEntry }: BalancePagerProps) {
  const themed = useStyles();
  const { width: windowWidth } = useWindowDimensions();
  const column = Math.min(windowWidth, layout.contentMax);
  const reduceMotion = useReducedMotion();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const count = pages.length;
  const active = count ? Math.min(index, count - 1) : 0;

  useEffect(() => {
    if (count && index > count - 1) setIndex(count - 1);
  }, [count, index]);

  // One entrance per app session, decided on mount; skipped under reduced motion.
  const [playIntro] = useState(() => !homeIntroPlayed && !reduceMotion);
  const coins = useSharedValue(playIntro ? 0 : 1);
  const fab = useSharedValue(playIntro ? 0 : 1);
  useEffect(() => {
    if (!playIntro) return;
    homeIntroPlayed = true;
    const splashLeft = Math.max(0, Math.min(motion.splash, motion.splash - (Date.now() - MODULE_LOADED_AT)));
    const easing = Easing.out(Easing.cubic);
    coins.value = withDelay(splashLeft + 80, withTiming(1, { duration: 420, easing }));
    fab.value = withDelay(splashLeft + 200, withTiming(1, { duration: 260, easing }));
    // Shared values are stable refs; the entrance runs once on mount.
  }, []);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!(column > 0)) return;
    const next = Math.round(event.nativeEvent.contentOffset.x / column);
    setIndex((current) => (current === next ? current : Math.max(0, next)));
  }, [column]);

  const goTo = (target: number) => {
    setIndex(target);
    scrollRef.current?.scrollTo({ x: target * column, y: 0, animated: !reduceMotion });
  };

  return (
    <View>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        decelerationRate="fast"
        scrollEnabled={count > 1}
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={32}
      >
        {pages.map((page, pageIndex) => (
          <BalanceCardPage
            key={page.currency}
            page={page}
            index={pageIndex}
            count={count}
            width={column}
            // At most three coin stacks stay mounted (the visible page and its neighbours) to respect the clay budget.
            showArt={Math.abs(pageIndex - active) <= 1}
            coins={coins}
            fab={fab}
            onAddEntry={onAddEntry}
          />
        ))}
      </ScrollView>
      {count > 1 ? (
        <View style={styles.dots}>
          {pages.map((page, pageIndex) => {
            const selected = pageIndex === active;
            return (
              <Touch
                key={`dot-${page.currency}`}
                onPress={() => goTo(pageIndex)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Show ${page.currency} balance, ${pageIndex + 1} of ${count}`}
                pressedScale={0.9}
                containerStyle={styles.dotTarget}
                pressableStyle={styles.dotPressable}
              >
                <View style={selected ? themed.dotActive : themed.dotInactive} />
              </Touch>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

type CardPageProps = {
  page: BalancePage;
  index: number;
  count: number;
  width: number;
  showArt: boolean;
  coins: SharedValue<number>;
  fab: SharedValue<number>;
  onAddEntry: () => void;
};

const BalanceCardPage = memo(function BalanceCardPage({ page, index, count, width, showArt, coins, fab, onAddEntry }: CardPageProps) {
  const { colors: c, isDark } = useTheme();
  const W = Math.max(0, width - 40);
  const rawId = useId();
  const idBase = rawId.replace(/[^A-Za-z0-9_-]/g, "");
  const glowId = `balance-glow-${idBase}`;
  const clipId = `balance-clip-${idBase}`;
  const body = bodyPath(W);
  const chip = chipFor(page);
  const placeholder = page.mode === "loading" || page.mode === "offline";
  // The shell-tinted fake shadow reads on the light canvas; on the dark canvas it would only lighten it, so it turns into a true shadow.
  const shadowFill = isDark ? c.shadow : c.shell;

  const coinsStyle = useAnimatedStyle(() => ({
    opacity: coins.value,
    transform: [{ translateY: (1 - coins.value) * 12 }],
  }));
  const fabStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.8 + 0.2 * fab.value }],
  }));

  return (
    <View style={[styles.page, { width }]}>
      <View style={[styles.wrapper, { width: W }]}>
        {/* 1. Body: fake shadow, silhouette, glow, rings and a top highlight (a full hairline in dark). No elevation, no filters. */}
        <View pointerEvents="none" style={[styles.body, { width: W, height: H + 30 }]}>
          <Svg width={W} height={H + 30}>
            <Defs>
              <RadialGradient id={glowId} cx="0.82" cy="0.3" r="0.65">
                <Stop offset="0" stopColor={c.shellEnd} stopOpacity={0.55} />
                <Stop offset="1" stopColor={c.shellEnd} stopOpacity={0} />
              </RadialGradient>
              <ClipPath id={clipId}>
                <Path d={body} clipRule="nonzero" />
              </ClipPath>
            </Defs>
            <Path d={body} transform="translate(8 20) scale(0.95 1)" fill={shadowFill} fillOpacity={0.04} />
            <Path d={body} transform="translate(4 14) scale(0.975 1)" fill={shadowFill} fillOpacity={0.08} />
            <Path d={body} transform="translate(0 8)" fill={shadowFill} fillOpacity={0.14} />
            <Path d={body} fill={c.shell} />
            <Path d={body} fill={`url(#${glowId})`} />
            <G clipPath={`url(#${clipId})`} clipRule="nonzero">
              <Circle cx={W - 54} cy={64} r={108} fill={colors.lavender} fillOpacity={0.06} />
              <Circle cx={W - 54} cy={64} r={82} fill={colors.lavender} fillOpacity={0.06} />
              <Circle cx={W - 54} cy={64} r={58} fill={colors.lavender} fillOpacity={0.06} />
              {/* Clipped to the body, so the 2pt stroke draws a crisp 1pt hairline just inside the edge. */}
              {isDark ? <Path d={body} fill="none" stroke={DARK_HAIRLINE} strokeWidth={2} /> : null}
            </G>
            {isDark ? null : <Path d={topEdgePath(W)} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={1} />}
          </Svg>
        </View>

        {/* 2. Text layer: one accessible group, so the "+" stays its own element. */}
        <View accessible accessibilityLabel={pageLabel(page, index, count)} style={styles.textLayer}>
          {chip ? (
            <View style={styles.chip}>
              <Icon name={chip.icon} size={14} color={chip.color} />
              {createElement(NativeText, { numberOfLines: 1, maxFontSizeMultiplier: 1.3, style: [styles.chipLabel, { color: chip.color }] }, chip.label)}
            </View>
          ) : (
            <View style={styles.chipSpacer} />
          )}
          {placeholder ? (
            <View style={styles.amountBar} />
          ) : (
            createElement(
              NativeText,
              { numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.6, maxFontSizeMultiplier: 1.2, style: styles.amount },
              page.mode === "empty" ? formatMoney(0, page.currency) : formatMoney(Math.abs(page.netMinor), page.currency),
            )
          )}
          {createElement(NativeText, { numberOfLines: 1, maxFontSizeMultiplier: 1.2, style: styles.caption }, captionFor(page))}
          {page.mode === "ready" ? (
            <View style={styles.breakdown}>
              <Breakdown label="Owed to you" icon="arrow-down" tint={colors.mintBright} value={formatMoney(page.owedMinor, page.currency)} />
              <View style={styles.divider} />
              <Breakdown label="You owe" icon="arrow-up" tint={colors.coralBright} value={formatMoney(page.oweMinor, page.currency)} />
            </View>
          ) : null}
          {page.mode === "empty"
            ? createElement(NativeText, { numberOfLines: 2, maxFontSizeMultiplier: 1.2, style: styles.emptyHint }, "Tap + to log what you owe or what's owed to you.")
            : null}
        </View>

        {/* 3. Clay coin stack breaking out of the card's top and right edges. */}
        {showArt
          ? createElement(
            Animated.View,
            { pointerEvents: "none", style: [styles.coins, coinsStyle] },
            <ClayCoinStack size={132} surface="dark" />,
          )
          : null}

        {/* 4. "+" straddling the bottom edge. The wrapper carries the entrance scale; Touch keeps its own press scale. */}
        {createElement(
          Animated.View,
          { pointerEvents: "box-none", style: [styles.fab, fabStyle] },
          <FabButton size={FAB_SIZE} tone="violet" accessibilityLabel="Add entry" accessibilityHint="Choose an individual or group entry" onPress={onAddEntry} />,
        )}
      </View>
    </View>
  );
});

function Breakdown({ label, icon, tint, value }: { label: string; icon: IconName; tint: string; value: string }) {
  return (
    <View style={styles.column}>
      <View style={styles.columnLabelRow}>
        <View style={[styles.arrowCircle, { backgroundColor: `${tint}2E` }]}>
          <Icon name={icon} size={11} color={tint} />
        </View>
        {createElement(NativeText, { numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.85, maxFontSizeMultiplier: 1.2, style: styles.columnLabel }, label)}
      </View>
      {createElement(NativeText, { numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.75, maxFontSizeMultiplier: 1.2, style: styles.columnValue }, value)}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: 20,
    paddingTop: PAGE_TOP,
    paddingBottom: PAGE_BOTTOM,
  },
  wrapper: {
    height: H + 26,
  },
  body: {
    position: "absolute",
    left: 0,
    top: 0,
  },
  textLayer: {
    position: "absolute",
    left: 20,
    top: 20,
    right: 128,
  },
  chip: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  chipSpacer: {
    height: 26,
  },
  chipLabel: {
    flexShrink: 1,
    fontFamily: "Manrope_600SemiBold",
    fontSize: 12.5,
    lineHeight: 16,
  },
  amount: {
    marginTop: 12,
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -1,
    color: colors.white,
  },
  amountBar: {
    marginTop: 12 + 5,
    marginBottom: 5,
    width: 132,
    maxWidth: "100%",
    height: 30,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  caption: {
    marginTop: 2,
    fontFamily: "Manrope_500Medium",
    fontSize: 13,
    lineHeight: 18,
    color: "rgba(255,255,255,0.65)",
  },
  breakdown: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  divider: {
    width: 1,
    height: 30,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  column: {
    flex: 1,
    minWidth: 0,
  },
  columnLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  arrowCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  columnLabel: {
    flexShrink: 1,
    fontFamily: "Manrope_600SemiBold",
    fontSize: 11,
    lineHeight: 14,
    color: "rgba(255,255,255,0.6)",
  },
  columnValue: {
    marginTop: 4,
    fontFamily: "Manrope_700Bold",
    fontSize: 15,
    lineHeight: 20,
    color: colors.white,
  },
  emptyHint: {
    marginTop: 14,
    fontFamily: "Manrope_500Medium",
    fontSize: 12.5,
    lineHeight: 17,
    color: "rgba(255,255,255,0.6)",
  },
  coins: {
    position: "absolute",
    right: -8,
    top: -24,
  },
  fab: {
    position: "absolute",
    left: 20,
    top: H - FAB_SIZE / 2,
  },
  dots: {
    marginTop: 2 - 19,
    height: 44,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  dotTarget: {
    width: 28,
    height: 44,
  },
  dotPressable: {
    width: 28,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});

const useStyles = makeStyles((c, { isDark }) => ({
  dotActive: {
    width: 18,
    height: 6,
    borderRadius: 3,
    backgroundColor: c.violet,
  },
  dotInactive: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: c.muted,
    // Muted at 40% all but vanishes on the dark canvas.
    opacity: isDark ? 0.6 : 0.4,
  },
}));
