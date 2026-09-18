import { Modal, Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeInDown, useReducedMotion } from "react-native-reanimated";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useScreenObscured } from "@/components/ui/ScreenObscured";
import { Text } from "@/components/ui/Text";
import { shadows } from "@/theme/shadows";
import { makeStyles, useTheme } from "@/theme/ThemeProvider";

type ConfirmModalProps = {
  visible: boolean;
  icon?: IconName;
  title: string;
  detail: string;
  confirmLabel: string;
  /** `danger` is for removals: coral icon tile and a coral confirm button. */
  tone?: "default" | "danger";
  cancelLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

/** A branded confirmation dialog for actions that change a balance or payment state. */
export function ConfirmModal({
  visible,
  icon = "check-circle",
  title,
  detail,
  confirmLabel,
  tone = "default",
  cancelLabel = "Cancel",
  loading = false,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  const obscured = useScreenObscured();
  const reduceMotion = useReducedMotion();
  const { colors: c } = useTheme();
  const styles = useStyles();
  const danger = tone === "danger";
  const close = () => {
    if (!loading) onClose();
  };

  return (
    <Modal visible={visible && !obscured} transparent animationType="fade" presentationStyle="overFullScreen" onRequestClose={close}>
      <View style={styles.root} accessibilityViewIsModal>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel={`Close ${title}`} />
        <Animated.View entering={reduceMotion ? FadeIn.duration(140) : FadeInDown.duration(220)} style={styles.card}>
          <View style={[styles.iconWrap, danger && styles.iconWrapDanger]}>
            <Icon name={icon} size={29} color={danger ? c.coral : c.violet} />
          </View>
          <Text accessibilityRole="header" className="mt-5 text-center text-[22px] font-bold tracking-tight text-ink">{title}</Text>
          <Text className="mt-2 text-center text-[13px] leading-5 text-slate">{detail}</Text>
          <View className="mt-6 gap-2">
            <Button label={confirmLabel} icon={danger ? "trash-2" : "check"} variant={danger ? "danger" : "primary"} fullWidth loading={loading} onPress={onConfirm} />
            <Button label={cancelLabel} variant="ghost" fullWidth disabled={loading} onPress={close} />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((c, { isDark }) => ({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    // Light keeps its original, slightly heavier scrim for this centred dialog; dark uses the theme scrim.
    backgroundColor: isDark ? c.backdrop : "rgba(16,8,35,0.58)",
  },
  card: {
    width: "100%",
    maxWidth: 360,
    // The 1pt line border is what lifts the sheet off the scrim in dark mode, where the shadow is invisible.
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 28,
    backgroundColor: c.raised,
    padding: 24,
    ...shadows.sheet,
  },
  iconWrap: {
    width: 62,
    height: 62,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: c.violetSoft,
  },
  iconWrapDanger: {
    backgroundColor: c.coralSoft,
  },
}));
