import type { ReactNode } from "react";
import { Children, Fragment, createElement, isValidElement } from "react";
import { StyleSheet, Text as NativeText, View } from "react-native";
import { Icon, type IconName } from "@/components/ui/Icon";
import { makeStyles, useTheme } from "@/theme/ThemeProvider";

type InviteCardProps = {
  /** Small uppercase label above the card, like the Settings sections. */
  title: string;
  /** One line under the card (e.g. why email is unavailable). */
  footnote?: string | undefined;
  children: ReactNode;
};

/**
 * The "invite them to LenaDena" block on the People screens: a themed list card of InviteRow options (email,
 * share), separated by hairlines. Raised surface with a 1px line border, so it reads in both schemes.
 */
export function InviteCard({ title, footnote, children }: InviteCardProps) {
  const styles = useStyles();
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={shape.section}>
      {createElement(NativeText, { accessibilityRole: "header", maxFontSizeMultiplier: 1.4, style: styles.title }, title)}
      <View style={styles.card}>
        {rows.map((row, index) => (
          <Fragment key={row.key ?? index}>
            {index > 0 ? <View style={styles.divider} /> : null}
            {row}
          </Fragment>
        ))}
      </View>
      {footnote ? createElement(NativeText, { style: styles.footnote }, footnote) : null}
    </View>
  );
}

type InviteRowProps = {
  icon: IconName;
  title: string;
  detail: string;
  /** The control on the right: a Switch or a small Button. */
  trailing: ReactNode;
  /** Dims the icon and text (the trailing control handles its own disabled state). */
  muted?: boolean;
};

export function InviteRow({ icon, title, detail, trailing, muted = false }: InviteRowProps) {
  const { colors: c, isDark } = useTheme();
  const styles = useStyles();
  return (
    <View style={shape.row}>
      <View style={[styles.iconTile, muted && styles.iconTileMuted]}>
        {/* Violet text-size glyphs drop below 4.5:1 on the dark tiles, so they switch to lavender there. */}
        <Icon name={icon} size={21} color={muted ? c.muted : isDark ? c.lavender : c.violet} />
      </View>
      <View style={shape.copy}>
        {createElement(NativeText, { numberOfLines: 1, style: [styles.rowTitle, muted && styles.rowTitleMuted] }, title)}
        {createElement(NativeText, { numberOfLines: 2, style: styles.rowDetail }, detail)}
      </View>
      {trailing}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  title: {
    paddingHorizontal: 4,
    fontFamily: "Manrope_700Bold",
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: c.slate,
  },
  card: {
    overflow: "hidden",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: c.line,
    backgroundColor: c.raised,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 74,
    backgroundColor: c.line,
  },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.violetSoft,
  },
  iconTileMuted: {
    backgroundColor: c.surface,
  },
  rowTitle: {
    fontFamily: "Manrope_700Bold",
    fontSize: 15,
    lineHeight: 20,
    color: c.ink,
  },
  rowTitleMuted: {
    color: c.slate,
  },
  rowDetail: {
    marginTop: 2,
    fontFamily: "Manrope_500Medium",
    fontSize: 12,
    lineHeight: 16,
    color: c.slate,
  },
  footnote: {
    paddingHorizontal: 4,
    fontFamily: "Manrope_500Medium",
    fontSize: 12,
    lineHeight: 16,
    color: c.slate,
  },
}));

const shape = StyleSheet.create({
  section: {
    gap: 10,
  },
  row: {
    minHeight: 72,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
});
