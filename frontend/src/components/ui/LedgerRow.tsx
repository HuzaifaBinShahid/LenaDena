import { createElement, type ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, Text as NativeText, View } from "react-native";
import { Icon } from "@/components/ui/Icon";
import { Touch } from "@/components/ui/Touch";
import type { AmountTone, StatusTone } from "@/features/ledger/rowCopy";
import { usePreferences } from "@/features/preferences/PreferencesProvider";
import { shadows } from "@/theme/shadows";
import { colors } from "@/theme/tokens";

type Base = {
  leading: ReactNode;
  title: string;
  subtitle: string;
  note?: string;
  amount?: { text: string; tone: AmountTone };
  status?: { label: string; tone: StatusTone };
  /** Top hairline, indented past the leading tile. Set it on every row after the first. */
  divider?: boolean;
  accessibilityLabel: string;
  accessibilityHint?: string;
};

/** A row is either pressable (with an optional chevron) or static (with an optional footer), never both, so buttons never nest in a Touch. */
export type LedgerRowProps =
  | (Base & { onPress: () => void; chevron?: boolean; footer?: never })
  | (Base & { onPress?: undefined; chevron?: never; footer?: ReactNode });

const DOT_COLORS: Record<StatusTone, string> = {
  neutral: colors.muted,
  positive: colors.mint,
  warning: colors.gold,
  danger: colors.coral,
};

const AMOUNT_COLORS: Record<AmountTone, string> = {
  positive: colors.mint,
  negative: colors.coral,
  neutral: colors.ink,
};

export function LedgerRow(props: LedgerRowProps) {
  const { leading, title, subtitle, note, amount, status, divider, accessibilityLabel, accessibilityHint } = props;

  const showChevron = Boolean(props.onPress && props.chevron);

  const amountText = amount
    ? createElement(NativeText, {
      numberOfLines: 1,
      adjustsFontSizeToFit: true,
      minimumFontScale: 0.85,
      style: [amount.tone === "neutral" ? styles.amountNeutral : styles.amountColoured, { color: AMOUNT_COLORS[amount.tone] }],
    }, amount.text)
    : null;

  const statusLine = status
    ? createElement(
      View,
      { style: [styles.status, amount ? styles.statusBelowAmount : null] },
      createElement(View, { style: [styles.dot, { backgroundColor: DOT_COLORS[status.tone] }] }),
      createElement(NativeText, { numberOfLines: 1, style: styles.statusLabel }, status.label),
    )
    : null;

  // The chevron follows the amount column directly (pl 4), outside the row's 14pt gap.
  const trailing = amount || status || showChevron
    ? createElement(
      View,
      { style: styles.trailing },
      amount || status ? createElement(View, { style: styles.right }, amountText, statusLine) : null,
      showChevron ? createElement(View, { style: styles.chevron }, <Icon name="chevron-right" size={16} color={colors.muted} />) : null,
    )
    : null;

  const content = createElement(
    View,
    { style: styles.row },
    leading,
    createElement(
      View,
      { style: styles.middle },
      createElement(NativeText, { numberOfLines: 1, style: styles.title }, title),
      createElement(NativeText, { numberOfLines: 1, style: styles.subtitle }, subtitle),
      note ? createElement(NativeText, { numberOfLines: 2, style: styles.note }, note) : null,
    ),
    trailing,
  );

  const hairline = divider ? createElement(View, { style: styles.divider }) : null;

  if (props.onPress) {
    return createElement(
      View,
      null,
      hairline,
      <Touch
        onPress={props.onPress}
        pressedScale={0.985}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
      >
        {content}
      </Touch>,
    );
  }

  return createElement(
    View,
    null,
    hairline,
    // Only the row itself is one accessible element; the footer stays outside it so its buttons remain reachable.
    createElement(View, { accessible: true, accessibilityLabel, accessibilityHint }, content),
    props.footer ? createElement(View, { style: styles.footer }, props.footer) : null,
  );
}

export type LedgerListProps = { children: ReactNode; style?: StyleProp<ViewStyle> };

/**
 * List shell: radius 22, 1pt line border, `palette.surface`, `shadows.card`.
 * The shadow sits on an outer view because `overflow: hidden` would clip it on iOS; the inner view clips the rows.
 */
export function LedgerList({ children, style }: LedgerListProps) {
  const { palette } = usePreferences();
  return createElement(
    View,
    { style: [styles.listShadow, { backgroundColor: palette.surface }, shadows.card, style] },
    createElement(View, { style: styles.listClip }, children),
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 76,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 78,
    backgroundColor: colors.line,
  },
  middle: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: "Manrope_700Bold",
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink,
  },
  subtitle: {
    marginTop: 3,
    fontFamily: "Manrope_500Medium",
    fontSize: 12,
    lineHeight: 16,
    color: colors.slate,
  },
  note: {
    marginTop: 4,
    fontFamily: "Manrope_500Medium",
    fontSize: 11,
    lineHeight: 15,
    color: colors.slate,
  },
  trailing: {
    flexDirection: "row",
    alignItems: "center",
    maxWidth: "45%",
  },
  right: {
    flexShrink: 1,
    alignItems: "flex-end",
    paddingLeft: 8,
    minWidth: 92,
  },
  amountColoured: {
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 18,
    lineHeight: 24,
  },
  amountNeutral: {
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 16,
    lineHeight: 22,
  },
  status: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  statusBelowAmount: {
    marginTop: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusLabel: {
    flexShrink: 1,
    fontFamily: "Manrope_600SemiBold",
    fontSize: 11,
    lineHeight: 14,
    color: colors.slate,
  },
  chevron: {
    paddingLeft: 4,
  },
  footer: {
    paddingLeft: 78,
    paddingRight: 16,
    paddingBottom: 12,
  },
  listShadow: {
    borderRadius: 22,
  },
  listClip: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
  },
});
