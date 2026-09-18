import { createElement } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useScreenObscured } from "@/components/ui/ScreenObscured";
import { Text } from "@/components/ui/Text";
import { Touch } from "@/components/ui/Touch";
import { makeStyles, useTheme } from "@/theme/ThemeProvider";
import { colors } from "@/theme/tokens";

type ExpenseScopeModalProps = {
  visible: boolean;
  onClose: () => void;
  onIndividual: () => void;
  onGroup: () => void;
};

/** The light scrim keeps its original depth; dark mode uses the theme's deeper backdrop. */
const LIGHT_SCRIM = "rgba(16,8,35,0.52)";
/** Lavender hairline where the sheet meets the dark scrim. */
const DARK_HAIRLINE = "rgba(181,165,255,0.16)";

export function ExpenseScopeModal({ visible, onClose, onIndividual, onGroup }: ExpenseScopeModalProps) {
  const obscured = useScreenObscured();
  const themed = useStyles();
  const { isDark } = useTheme();
  return (
    <Modal visible={visible && !obscured} transparent animationType="fade" presentationStyle="overFullScreen" onRequestClose={onClose}>
      <View style={themed.root} accessibilityViewIsModal>
        {createElement(Pressable, { style: StyleSheet.absoluteFill, onPress: onClose, accessibilityLabel: "Close expense options" })}
        {createElement(
          Animated.View,
          { entering: FadeInDown.duration(220), style: [styles.sheet, themed.sheet] },
          <View style={[styles.handle, themed.handle]} />,
          <View className="flex-row items-start gap-3">
            <View className="h-11 w-11 items-center justify-center rounded-2xl bg-violet-soft">
              {/* Lavender in dark: violet on the deep violet tile reads dim. */}
              <Text className={`text-lg font-bold ${isDark ? "text-lavender" : "text-violet"}`}>+</Text>
            </View>
            <View className="flex-1">
              <Text className="text-[22px] font-bold tracking-tight text-ink">Add amount due</Text>
              <Text className="mt-1 text-[13px] leading-5 text-slate">Who should this balance belong to?</Text>
            </View>
          </View>,
          <View className="mt-6 gap-3">
            <ScopeChoice primary label="Individual" description="Track what you owe or what someone owes you" icon="user" onPress={onIndividual} />
            <ScopeChoice label="Group" description="Split a cost and track what each person owes" icon="users" onPress={onGroup} />
          </View>,
          <View className="mt-3 items-center">
            <Button label="Not now" variant="ghost" onPress={onClose} />
          </View>,
        )}
      </View>
    </Modal>
  );
}

type ScopeChoiceProps = { label: string; description: string; icon: IconName; primary?: boolean; onPress: () => void };

/**
 * A full-width choice card: icon tile, label and description, arrow chip. The primary card is a violet fill with white
 * content in both themes; the secondary is a raised card with a hairline in light, and a lifted surface on the dark sheet
 * (raised on raised would vanish there).
 */
function ScopeChoice({ label, description, icon, primary = false, onPress }: ScopeChoiceProps) {
  const themed = useStyles();
  const { colors: c, isDark } = useTheme();
  // Lavender in dark: violet on the deep violet tile and chip reads dim.
  const accent = primary ? colors.white : isDark ? colors.lavender : c.violet;
  return (
    <Touch
      onPress={onPress}
      haptic
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={description}
      containerStyle={styles.choiceBox}
    >
      <View style={[styles.choice, primary ? styles.choicePrimary : themed.choiceSecondary]}>
        <View style={[styles.choiceTile, primary ? styles.onVioletFill : themed.secondaryTile]}>
          <Icon name={icon} size={21} color={accent} />
        </View>
        <View style={styles.choiceText}>
          <Text className={`text-[15px] font-bold ${primary ? "text-white" : "text-ink"}`}>{label}</Text>
          <Text className={`mt-1 text-left text-[11px] leading-4 ${primary ? "text-white/70" : "text-slate"}`}>{description}</Text>
        </View>
        <View style={[styles.choiceArrow, primary ? styles.onVioletFill : themed.secondaryChip]}>
          <Icon name="arrow-right" size={16} color={accent} />
        </View>
      </View>
    </Touch>
  );
}

const styles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
  },
  handle: {
    width: 42,
    height: 5,
    alignSelf: "center",
    borderRadius: 3,
    marginBottom: 22,
  },
  choiceBox: {
    alignSelf: "stretch",
  },
  choice: {
    minHeight: 82,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 12,
  },
  // Static violet: white on it keeps 4.7:1 in both themes (the dark palette's brighter violet would not).
  choicePrimary: {
    backgroundColor: colors.violet,
    borderColor: colors.violet,
  },
  choiceTile: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  choiceText: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-start",
  },
  choiceArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  onVioletFill: {
    backgroundColor: "rgba(255,255,255,0.15)",
  },
});

const useStyles = makeStyles((c, { isDark }) => ({
  root: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: isDark ? c.backdrop : LIGHT_SCRIM,
  },
  sheet: {
    backgroundColor: c.raised,
    borderColor: isDark ? DARK_HAIRLINE : c.line,
    shadowColor: c.shadow,
  },
  handle: {
    backgroundColor: isDark ? "rgba(181,165,255,0.24)" : c.line,
  },
  choiceSecondary: {
    backgroundColor: isDark ? c.surface : c.raised,
    borderColor: c.line,
  },
  secondaryTile: {
    backgroundColor: c.violetSoft,
  },
  secondaryChip: {
    backgroundColor: isDark ? c.violetSoft : c.surface,
  },
}));
