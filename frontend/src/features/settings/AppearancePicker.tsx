import { createElement, useId } from "react";
import { Text as NativeText, View } from "react-native";
import Animated, { useReducedMotion, ZoomIn } from "react-native-reanimated";
import Svg, { Circle, ClipPath, Defs, G, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Text } from "@/components/ui/Text";
import { Touch } from "@/components/ui/Touch";
import { usePreferences, type ThemePreference } from "@/features/preferences/PreferencesProvider";
import { APPEARANCE_OPTIONS, appearanceHint, type AppearanceOption } from "@/features/settings/appearance";
import { palettes, type Palette, type Scheme } from "@/theme/palettes";
import { makeStyles, useTheme } from "@/theme/ThemeProvider";
// Static tokens only where a colour must not follow the theme: white marks on violet or on the
// dark shells inside the previews, and the System emblem that sits across both halves.
import { colors } from "@/theme/tokens";

/** Preview drawing space: a phone screen cropped to the top of the home tab. */
const MINI = { width: 100, height: 128 } as const;
/** The dark half of the System preview: the triangle below the top-right to bottom-left diagonal. */
const DARK_HALF = `M${MINI.width} 0 L${MINI.width} ${MINI.height} L0 ${MINI.height} Z`;
/** The hairline the app draws where a dark shell meets the dark canvas. */
const SHELL_EDGE = "rgba(181,165,255,0.16)";
const DOCK_DOTS = [30.5, 43.5, 56.5, 69.5] as const;

const RING = 2;
const RING_GAP = 3;
const RADIUS = 20;

const HINT_ICONS: Record<ThemePreference, IconName> = { light: "sun", dark: "moon", system: "phone" };

type MiniRowProps = { p: Palette; y: number; tile: string; accent: string; titleWidth: number };

function MiniRow({ p, y, tile, accent, titleWidth }: MiniRowProps) {
  return (
    <G>
      <Rect x={11} y={y} width={8.5} height={8.5} rx={2.6} fill={tile} />
      <Circle cx={15.25} cy={y + 4.25} r={1.6} fill={accent} />
      <Rect x={23} y={y + 0.8} width={titleWidth} height={2.8} rx={1.4} fill={p.ink} fillOpacity={0.9} />
      <Rect x={23} y={y + 5.3} width={18} height={2.2} rx={1.1} fill={p.slate} fillOpacity={0.8} />
      <Rect x={75} y={y + 2.3} width={14} height={3} rx={1.5} fill={accent} />
    </G>
  );
}

/**
 * The home tab in miniature, drawn from one palette so every preview is true to its scheme
 * whatever the app is showing: greeting, the dark balance card with its "+", a two-row ledger
 * (owed to you in mint, you owe in coral) and the floating dock.
 */
function MiniHome({ p, scheme, glowId }: { p: Palette; scheme: Scheme; glowId: string }) {
  const edge = scheme === "dark" ? SHELL_EDGE : "none";
  return (
    <G>
      <Rect x={0} y={0} width={MINI.width} height={MINI.height} fill={p.canvas} />

      <Rect x={7} y={8} width={11} height={11} rx={4} fill={p.violetSoft} stroke={p.line} strokeWidth={0.6} />
      <Rect x={22} y={9} width={24} height={3} rx={1.5} fill={p.slate} fillOpacity={0.7} />
      <Rect x={22} y={14.4} width={36} height={4.2} rx={2.1} fill={p.ink} />

      <Rect x={7} y={25} width={86} height={40} rx={8} fill={p.shell} stroke={edge} strokeWidth={0.6} />
      <Rect x={7} y={25} width={86} height={40} rx={8} fill={`url(#${glowId})`} />
      <Rect x={12} y={30.5} width={22} height={4.6} rx={2.3} fill={colors.white} fillOpacity={0.12} />
      <Circle cx={15.4} cy={32.8} r={1.1} fill={colors.mintBright} />
      <Rect x={12} y={38.5} width={40} height={7} rx={3.5} fill={colors.white} />
      <Rect x={12} y={48.5} width={30} height={2.6} rx={1.3} fill={colors.white} fillOpacity={0.45} />
      <Rect x={12} y={55} width={15} height={3} rx={1.5} fill={colors.mintBright} fillOpacity={0.9} />
      <Rect x={31} y={55} width={15} height={3} rx={1.5} fill={colors.coralBright} fillOpacity={0.9} />
      <Circle cx={83} cy={65} r={6} fill={p.violet} stroke={p.canvas} strokeWidth={1.5} />
      <Rect x={80.4} y={64.4} width={5.2} height={1.2} rx={0.6} fill={colors.white} />
      <Rect x={82.4} y={62.4} width={1.2} height={5.2} rx={0.6} fill={colors.white} />

      <Rect x={7} y={76} width={22} height={3.4} rx={1.7} fill={p.ink} fillOpacity={0.85} />
      <Rect x={80} y={76.4} width={13} height={2.6} rx={1.3} fill={p.violet} fillOpacity={0.85} />
      <Rect x={7} y={83} width={86} height={31} rx={6} fill={p.raised} stroke={p.line} strokeWidth={0.6} />
      <MiniRow p={p} y={86.5} tile={p.limeSoft} accent={p.mint} titleWidth={28} />
      <Rect x={23} y={98.2} width={66} height={0.5} fill={p.line} />
      <MiniRow p={p} y={101.8} tile={p.coralSoft} accent={p.coral} titleWidth={22} />

      <Rect x={24} y={117.5} width={52} height={8} rx={4} fill={p.shell} stroke={edge} strokeWidth={0.6} />
      {DOCK_DOTS.map((cx, index) => (
        <Circle key={cx} cx={cx} cy={121.5} r={index === 0 ? 1.5 : 1.2} fill={colors.white} fillOpacity={index === 0 ? 1 : 0.45} />
      ))}
    </G>
  );
}

/** Light and Dark draw one palette; System draws light with the dark home clipped over the lower-right half. */
function MiniScreen({ look }: { look: ThemePreference }) {
  const base = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const lightGlow = `appearance-glow-light-${base}`;
  const darkGlow = `appearance-glow-dark-${base}`;
  const darkHalf = `appearance-dark-half-${base}`;
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${MINI.width} ${MINI.height}`}
      preserveAspectRatio="xMidYMid slice"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Defs>
        {/* The balance card's violet glow, as on the home card. */}
        <RadialGradient id={lightGlow} cx="0.82" cy="0.3" r="0.65">
          <Stop offset="0" stopColor={palettes.light.shellEnd} stopOpacity={0.55} />
          <Stop offset="1" stopColor={palettes.light.shellEnd} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={darkGlow} cx="0.82" cy="0.3" r="0.65">
          <Stop offset="0" stopColor={palettes.dark.shellEnd} stopOpacity={0.55} />
          <Stop offset="1" stopColor={palettes.dark.shellEnd} stopOpacity={0} />
        </RadialGradient>
        <ClipPath id={darkHalf}>
          <Path d={DARK_HALF} clipRule="nonzero" />
        </ClipPath>
      </Defs>
      {look === "dark"
        ? <MiniHome p={palettes.dark} scheme="dark" glowId={darkGlow} />
        : <MiniHome p={palettes.light} scheme="light" glowId={lightGlow} />}
      {look === "system" ? (
        <G clipPath={`url(#${darkHalf})`} clipRule="nonzero">
          <MiniHome p={palettes.dark} scheme="dark" glowId={darkGlow} />
        </G>
      ) : null}
    </Svg>
  );
}

function AppearanceCard({ option, selected, onSelect }: { option: AppearanceOption; selected: boolean; onSelect: () => void }) {
  const styles = useStyles();
  const reduceMotion = useReducedMotion();
  return (
    <Touch
      onPress={onSelect}
      haptic
      pressedScale={0.96}
      accessibilityRole="radio"
      accessibilityLabel={option.label}
      accessibilityHint={option.hint}
      accessibilityState={{ checked: selected }}
      containerStyle={styles.option}
    >
      <View style={[styles.ring, selected ? styles.ringSelected : null]}>
        <View style={styles.preview}>
          <MiniScreen look={option.key} />
          {option.key === "system" ? (
            <View pointerEvents="none" style={styles.emblem}>
              <Icon name="phone" size={12} color={colors.violetStrong} />
            </View>
          ) : null}
        </View>
        {selected
          ? createElement(
            Animated.View,
            { entering: reduceMotion ? undefined : ZoomIn.duration(180), pointerEvents: "none", style: styles.check },
            <Icon name="check" size={13} color={colors.white} />,
          )
          : null}
      </View>
      {createElement(
        NativeText,
        { numberOfLines: 1, maxFontSizeMultiplier: 1.4, style: [styles.label, selected ? styles.labelSelected : null] },
        option.label,
      )}
    </Touch>
  );
}

/**
 * Settings → Appearance: three live previews (Light, Dark, System) instead of a form control.
 * Choosing one re-themes the whole app at once; the line underneath says what the choice means now.
 */
export function AppearancePicker() {
  const { theme, scheme, setTheme } = usePreferences();
  const { colors: c } = useTheme();
  const styles = useStyles();
  const hint = appearanceHint(theme, scheme);

  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" className="px-1 text-[11px] font-bold uppercase tracking-[1.2px] text-slate">Appearance</Text>
      <View style={styles.card}>
        <View style={styles.options} accessibilityRole="radiogroup">
          {APPEARANCE_OPTIONS.map((option) => (
            <AppearanceCard key={option.key} option={option} selected={theme === option.key} onSelect={() => setTheme(option.key)} />
          ))}
        </View>
        <View style={styles.hintRow}>
          <Icon name={HINT_ICONS[theme]} size={16} color={c.violet} />
          {createElement(
            NativeText,
            { style: styles.hint, accessibilityLiveRegion: "polite" },
            hint.text,
            hint.emphasis ? createElement(NativeText, { style: styles.hintEmphasis }, hint.emphasis) : null,
          )}
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  section: {
    gap: 10,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: c.line,
    backgroundColor: c.raised,
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 14,
  },
  options: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
  },
  option: {
    flex: 1,
    maxWidth: 148,
  },
  ring: {
    borderRadius: RADIUS,
    borderWidth: RING,
    borderColor: "transparent",
    padding: RING_GAP,
  },
  ringSelected: {
    borderColor: c.violet,
  },
  preview: {
    aspectRatio: MINI.width / MINI.height,
    borderRadius: RADIUS - RING - RING_GAP,
    // Defines the light preview on a light card and the dark preview on a dark one.
    borderWidth: 1,
    borderColor: c.line,
    overflow: "hidden",
  },
  emblem: {
    position: "absolute",
    // On the diagonal (x 42.2 of 100 where y is 74 of 128), centred between the balance card and the list.
    left: "42.2%",
    top: "57.8%",
    width: 24,
    height: 24,
    marginLeft: -12,
    marginTop: -12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(23,17,41,0.08)",
    // One bright emblem across both halves, so it reads the same in either theme.
    backgroundColor: colors.white,
    shadowColor: colors.night,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 5,
    elevation: 3,
  },
  check: {
    position: "absolute",
    top: -7,
    right: -7,
    width: 24,
    height: 24,
    borderRadius: 12,
    // The card colour cuts the badge out of the ring's corner.
    borderWidth: 2.5,
    borderColor: c.raised,
    backgroundColor: c.violet,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    marginTop: 8,
    textAlign: "center",
    fontFamily: "Manrope_600SemiBold",
    fontSize: 13,
    lineHeight: 18,
    color: c.slate,
  },
  labelSelected: {
    fontFamily: "Manrope_700Bold",
    color: c.ink,
  },
  hintRow: {
    marginTop: 14,
    paddingTop: 12,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: c.line,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  hint: {
    flex: 1,
    fontFamily: "Manrope_500Medium",
    fontSize: 12,
    lineHeight: 17,
    color: c.slate,
  },
  hintEmphasis: {
    fontFamily: "Manrope_700Bold",
    color: c.ink,
  },
}));
