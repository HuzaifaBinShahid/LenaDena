import { createElement } from "react";
import { StyleSheet, Text as NativeText, View } from "react-native";
import { Icon } from "@/components/ui/Icon";
import { Touch } from "@/components/ui/Touch";
import { makeStyles, useTheme } from "@/theme/ThemeProvider";
import { colors } from "@/theme/tokens";
import { PersonAvatar } from "./PersonAvatar";

type PersonChipProps = {
  name: string;
  /** Shown on the chip (usually the first name). */
  label: string;
  uri?: string | null;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel: string;
};

/**
 * One saved person in a picker row. Selected is unmistakable in both themes: a solid violet chip with a white
 * label and a check. Unselected chips are quiet surface fills.
 */
export function PersonChip({ name, label, uri, selected, onPress, accessibilityLabel }: PersonChipProps) {
  const styles = useStyles();
  return (
    <Touch
      onPress={onPress}
      pressedScale={0.95}
      haptic
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, selected }}
      accessibilityLabel={accessibilityLabel}
      pressableStyle={[shape.chip, selected ? styles.selected : styles.idle]}
    >
      <PersonAvatar name={name} uri={uri} size={28} />
      {createElement(NativeText, { numberOfLines: 1, maxFontSizeMultiplier: 1.3, style: [shape.label, selected ? styles.labelSelected : styles.labelIdle] }, label)}
      {selected ? (
        <View style={shape.check}>
          <Icon name="check" size={12} color={colors.violetStrong} />
        </View>
      ) : null}
    </Touch>
  );
}

/** The "+ New" chip: starts a brand-new name in the text field. */
export function NewPersonChip({ onPress, active }: { onPress: () => void; active: boolean }) {
  const { colors: c, isDark } = useTheme();
  const styles = useStyles();
  // Lavender reads on the deep violet-soft fill in dark mode; violetStrong keeps 4.5:1 on the pale one.
  const tint = isDark ? colors.lavender : colors.violetStrong;
  return (
    <Touch
      onPress={onPress}
      pressedScale={0.95}
      haptic
      accessibilityRole="button"
      accessibilityLabel="New person"
      accessibilityHint="Clears the choice so you can type a new name"
      pressableStyle={[shape.chip, shape.newChip, styles.newChip, active && { borderColor: c.violet }]}
    >
      <View style={[shape.newGlyph, { backgroundColor: c.violetSoft }]}>
        <Icon name="plus" size={16} color={tint} />
      </View>
      {createElement(NativeText, { numberOfLines: 1, maxFontSizeMultiplier: 1.3, style: [shape.label, shape.newLabel, { color: tint }] }, "New")}
    </Touch>
  );
}

const useStyles = makeStyles((c) => ({
  idle: {
    backgroundColor: c.surface,
    borderColor: c.surface,
  },
  selected: {
    backgroundColor: c.violet,
    borderColor: c.violet,
  },
  labelIdle: {
    color: c.ink,
    fontFamily: "Manrope_600SemiBold",
  },
  labelSelected: {
    color: colors.white,
    fontFamily: "Manrope_700Bold",
  },
  newChip: {
    backgroundColor: c.raised,
    borderColor: c.line,
  },
}));

const shape = StyleSheet.create({
  chip: {
    minHeight: 44,
    maxWidth: 200,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 8,
    paddingRight: 14,
    borderRadius: 22,
    borderWidth: 1.5,
  },
  newChip: {
    paddingLeft: 8,
  },
  newLabel: {
    fontFamily: "Manrope_700Bold",
  },
  label: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 19,
  },
  check: {
    width: 18,
    height: 18,
    marginLeft: -2,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.white,
  },
  newGlyph: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
});
